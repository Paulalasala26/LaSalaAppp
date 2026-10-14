'use strict';

// Backoffice TEST: listado y operaciones administrativas sobre los nodos
// protegidos lasala-users-v1 y lasala-roles-v1.
// Los hashes siguen en el formato SHA-256 heredado de la aplicación.
// Las operaciones están limitadas al administrador verificado por Firebase Auth.
const crypto = require('node:crypto');
const PROJECT = 'la-sala-app-test';
const DB = 'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const GOOGLE_KEYS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
const USERS_KEY = 'lasala-users-v1';
const ROLES_KEY = 'lasala-roles-v1';
const ROLES = new Set(['ADMIN', 'TECNICO', 'REGANTE', 'PEON', 'CARGADOR']);
const USER_RE = /^[A-Z0-9][A-Z0-9._-]{2,39}$/;
const HASH_RE = /^[0-9a-f]{64}$/i;
const DISABLED_PREFIX = 'disabled:';

function httpError(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.code = code;
  return error;
}
function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}
async function verifyFirebaseIdToken(token) {
  if (!token || token.length > 12000) throw httpError(401, 'UNAUTHORIZED');
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError(401, 'UNAUTHORIZED');
  let header, payload;
  try {
    header = decodePart(parts[0]);
    payload = decodePart(parts[1]);
  } catch (_) { throw httpError(401, 'UNAUTHORIZED'); }
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401, 'UNAUTHORIZED');
  const response = await fetch(GOOGLE_KEYS, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('No se pueden validar tokens');
  const keys = await response.json();
  const jwk = (keys.keys || []).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw httpError(401, 'UNAUTHORIZED');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw httpError(401, 'UNAUTHORIZED');
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== 'https://securetoken.google.com/' + PROJECT ||
      payload.aud !== PROJECT || !payload.sub || typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' || payload.exp <= now ||
      typeof payload.iat !== 'number' || payload.iat > now + 60 ||
      typeof payload.auth_time !== 'number' || payload.auth_time > now + 60 ||
      payload.sub.length > 128) throw httpError(401, 'UNAUTHORIZED');
  const appUser = payload.appUser;
  if (typeof appUser !== 'string' || !/^[A-Z0-9 ._-]{1,80}$/.test(appUser))
    throw httpError(403, 'FORBIDDEN');
  // El identificador Auth debe corresponder al usuario que emitió firebase-auth.
  const expectedUid = 'lasala-' + crypto.createHash('sha256')
    .update(appUser, 'utf8').digest('hex').slice(0, 40);
  if (payload.sub !== expectedUid) throw httpError(401, 'UNAUTHORIZED');
  return appUser;
}
function serviceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    throw new Error('Firebase no configurado');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (sa.project_id !== PROJECT || !sa.private_key || !sa.client_email)
    throw new Error('Cuenta de servicio incorrecta');
  return sa;
}
function enc(v) { return Buffer.from(v).toString('base64url'); }
async function serviceAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const data = enc(JSON.stringify({alg:'RS256',typ:'JWT'})) + '.' +
    enc(JSON.stringify({
      iss:sa.client_email,scope:SCOPE,aud:'https://oauth2.googleapis.com/token',
      iat:now,exp:now+3600
    }));
  const assertion = data + '.' + crypto.sign('RSA-SHA256',Buffer.from(data),sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion
    }).toString(),signal:AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('OAuth Firebase no disponible');
  const body=await r.json();
  if (!body.access_token) throw new Error('Sin token del servicio');
  return body.access_token;
}
function parseMap(value) {
  if (value == null) return {};
  if (typeof value === 'string') {
    try { value=JSON.parse(value); } catch (_) { throw new Error('JSON de usuarios inválido'); }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Estructura de usuarios inválida');
  return value;
}
function keyUrl(key) { return DB+'/'+encodeURIComponent(key)+'.json'; }
async function readKey(key, accessToken) {
  const r=await fetch(keyUrl(key),{
    headers:{Authorization:'Bearer '+accessToken},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if (!r.ok) throw new Error('No se puede leer '+key);
  return parseMap(await r.json());
}
function validHash(hash) {
  return typeof hash === 'string' && HASH_RE.test(hash);
}
function isDisabled(hash) {
  return typeof hash === 'string' && hash.startsWith(DISABLED_PREFIX) &&
    validHash(hash.slice(DISABLED_PREFIX.length));
}
function hasPassword(hash) {
  return validHash(hash) || isDisabled(hash);
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 ||
      !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    throw httpError(400,'WEAK_PASSWORD');
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}
function validateUser(user, creating) {
  // Conserva compatibilidad con cuentas existentes como "MIGUEL ANGEL".
  // Las altas nuevas usan identificadores cortos sin espacios.
  if (typeof user !== 'string' ||
      !(creating ? USER_RE : /^[A-Z0-9][A-Z0-9._ -]{0,79}$/).test(user))
    throw httpError(400,'INVALID_USER');
  return user;
}
function validateRole(role) {
  if (!ROLES.has(role)) throw httpError(400,'INVALID_ROLE');
  return role;
}
function bodyOf(req) {
  let data=req.body;
  if (typeof data === 'string') {
    try { data=JSON.parse(data); } catch (_) { throw httpError(400,'INVALID_BODY'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw httpError(400,'INVALID_BODY');
  return data;
}
// CAS: evita pisar los cambios simultáneos de otro administrador y conserva
// el JSON serializado como string, requerido por el login actual.
async function updateKey(key, token, updater) {
  for (let attempt=0;attempt<5;attempt++) {
    const r=await fetch(keyUrl(key),{
      headers:{Authorization:'Bearer '+token,'X-Firebase-ETag':'true'},
      cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('No se puede leer '+key);
    const etag=r.headers.get('ETag');
    if (!etag) throw new Error('No se obtuvo ETag');
    const raw=await r.json();
    const map=parseMap(raw);
    const result=updater(map);
    if (result === false) return {changed:false};
    const legacyString=typeof raw === 'string' || raw == null;
    const value=legacyString ? JSON.stringify(map) : map;
    const put=await fetch(keyUrl(key)+'?print=silent',{
      method:'PUT',headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json','if-match':etag
      },
      body:JSON.stringify(value),signal:AbortSignal.timeout(10000)
    });
    if (put.ok) return {changed:true};
    if (put.status !== 412) throw new Error('No se pudo guardar '+key);
  }
  throw httpError(409,'CONCURRENT_MODIFICATION');
}
function countActiveAdmins(roles, accounts) {
  return Object.keys(roles).filter(user =>
    roles[user] === 'ADMIN' && validHash(accounts[user])).length;
}
function sanitizeUsers(accounts, roles) {
  const names=Array.from(new Set([...Object.keys(accounts),...Object.keys(roles)]))
    .sort((a,b)=>a.localeCompare(b,'es'));
  return names.map(user=>({
    user,role:ROLES.has(roles[user]) ? roles[user] : 'SIN_ROL',
    accessConfigured:hasPassword(accounts[user]),
    active:validHash(accounts[user])
  }));
}
async function performWrite(method, input, actor, token, accounts, roles) {
  const action=method==='POST' ? 'create' : input.action;
  const user=validateUser(input.user,action==='create');
  if (action==='create') {
    validateRole(input.role);
    const hash=validatePassword(input.password);
    if (Object.hasOwn(accounts,user) || Object.hasOwn(roles,user))
      throw httpError(409,'USER_EXISTS');
    // Crear desactivado inicialmente: nunca habilitar login sin rol.
    await updateKey(USERS_KEY,token,map=>{
      if (Object.hasOwn(map,user)) throw httpError(409,'USER_EXISTS');
      map[user]=DISABLED_PREFIX+hash;
    });
    await updateKey(ROLES_KEY,token,map=>{
      if (Object.hasOwn(map,user)) throw httpError(409,'USER_EXISTS');
      map[user]=input.role;
    });
    await updateKey(USERS_KEY,token,map=>{
      if (map[user] !== DISABLED_PREFIX+hash)
        throw httpError(409,'CONCURRENT_MODIFICATION');
      map[user]=hash;
    });
    console.info('ADMIN_USERS_TEST',actor,'create',user);
    return {operation:'created',user};
  }
  if (!Object.hasOwn(accounts,user) || !hasPassword(accounts[user]))
    throw httpError(404,'USER_NOT_FOUND');
  if (action==='changeRole') {
    const role=validateRole(input.role);
    if (user===actor && role !== 'ADMIN')
      throw httpError(409,'CANNOT_REMOVE_OWN_ADMIN');
    if (roles[user]==='ADMIN' && role!=='ADMIN' &&
        countActiveAdmins(roles,accounts)<=1 && validHash(accounts[user]))
      throw httpError(409,'LAST_ADMIN');
    await updateKey(ROLES_KEY,token,map=>{
      if (!Object.hasOwn(map,user)) throw httpError(404,'USER_NOT_FOUND');
      map[user]=role;
    });
  } else if (action==='resetPassword') {
    const hash=validatePassword(input.password);
    await updateKey(USERS_KEY,token,map=>{
      if (!hasPassword(map[user])) throw httpError(404,'USER_NOT_FOUND');
      map[user]=isDisabled(map[user]) ? DISABLED_PREFIX+hash : hash;
    });
  } else if (action==='deactivate') {
    if (user===actor) throw httpError(409,'CANNOT_DEACTIVATE_SELF');
    if (roles[user]==='ADMIN' && countActiveAdmins(roles,accounts)<=1)
      throw httpError(409,'LAST_ADMIN');
    await updateKey(USERS_KEY,token,map=>{
      if (!hasPassword(map[user])) throw httpError(404,'USER_NOT_FOUND');
      if (isDisabled(map[user])) return false;
      map[user]=DISABLED_PREFIX+map[user];
    });
  } else if (action==='activate') {
    if (!ROLES.has(roles[user])) throw httpError(409,'ROLE_REQUIRED');
    await updateKey(USERS_KEY,token,map=>{
      if (!hasPassword(map[user])) throw httpError(404,'USER_NOT_FOUND');
      if (validHash(map[user])) return false;
      map[user]=map[user].slice(DISABLED_PREFIX.length);
    });
  } else {
    throw httpError(400,'INVALID_ACTION');
  }
  console.info('ADMIN_USERS_TEST',actor,action,user);
  return {operation:action,user};
}
module.exports=async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (!['GET','POST','PATCH'].includes(req.method)) {
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const authorization=req.headers.authorization || '';
  if (!authorization.startsWith('Bearer '))
    return res.status(401).json({error:'UNAUTHORIZED'});
  try {
    const actor=await verifyFirebaseIdToken(authorization.slice(7).trim());
    const accessToken=await serviceAccessToken(serviceAccount());
    const [roles,accounts]=await Promise.all([
      readKey(ROLES_KEY,accessToken),readKey(USERS_KEY,accessToken)
    ]);
    // Se vuelve a validar el rol vigente y que el administrador siga activo.
    if (roles[actor]!=='ADMIN' || !validHash(accounts[actor]))
      throw httpError(403,'FORBIDDEN');
    if (req.method==='GET')
      return res.status(200).json({users:sanitizeUsers(accounts,roles),currentUser:actor});
    const body=bodyOf(req);
    const outcome=await performWrite(req.method,body,actor,accessToken,accounts,roles);
    // Auditar tras confirmar la escritura. Nunca almacenar password/hash.
    const {safeRecordAdminAudit}=require('./admin-audit');
    const auditLogged=await safeRecordAdminAudit(accessToken,{
      actor,area:'users',action:req.method==='POST'?'create':body.action,
      target:outcome.user,
      detail:(req.method==='POST'||body.action==='changeRole')?'Rol: '+body.role:''
    });
    return res.status(200).json({ok:true,...outcome,auditLogged});
  } catch (err) {
    const status=err.httpStatus || 503;
    if (status===503) console.error('admin-users TEST:',err.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':err.code});
  }
};

// Reutilizar la misma verificación ADMIN para catálogos del Backoffice TEST.
module.exports._adminCatalogHelpers = {verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,updateKey,validHash,httpError};
