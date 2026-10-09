'use strict';

// Backoffice TEST — endpoint de consulta, sin operaciones de escritura.
// Solo acepta un Firebase ID token válido de un administrador reconocido en RTDB.
const crypto = require('node:crypto');
const PROJECT = 'la-sala-app-test';
const DB = 'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const GOOGLE_KEYS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

function jsonPart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}
function httpError(status) {
  const error = new Error('Acceso rechazado');
  error.httpStatus = status;
  return error;
}
async function verifyFirebaseIdToken(token) {
  if (!token || token.length > 12000) throw httpError(401);
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError(401);
  let header, payload;
  try {
    header = jsonPart(parts[0]);
    payload = jsonPart(parts[1]);
  } catch (_) { throw httpError(401); }
  if (header.alg !== 'RS256' || !header.kid) throw httpError(401);
  const r = await fetch(GOOGLE_KEYS, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Claves de identidad no disponibles');
  const keys = await r.json();
  const jwk = (keys.keys || []).find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw httpError(401);
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valid = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw httpError(401);
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== 'https://securetoken.google.com/' + PROJECT ||
      payload.aud !== PROJECT ||
      !payload.sub || typeof payload.sub !== 'string' ||
      payload.exp <= now || payload.iat > now + 60 ||
      payload.auth_time > now + 60) throw httpError(401);
  const appUser = payload.appUser;
  if (typeof appUser !== 'string' || !/^[A-Z0-9 ._-]{1,80}$/.test(appUser)) throw httpError(403);
  return appUser;
}
function serviceAccount() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error('Servicio Firebase no configurado');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (sa.project_id !== PROJECT || !sa.private_key || !sa.client_email) throw new Error('Proyecto Firebase no válido');
  return sa;
}
function encode64(value) { return Buffer.from(value).toString('base64url'); }
function signJwt(sa, payload) {
  const part = encode64(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + encode64(JSON.stringify(payload));
  return part + '.' + crypto.sign('RSA-SHA256', Buffer.from(part), sa.private_key).toString('base64url');
}
async function serviceAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(sa, {
    iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  });
  if (!r.ok) throw new Error('Servicio Firebase no disponible');
  const result = await r.json();
  if (!result.access_token) throw new Error('Sin acceso a Firebase');
  return result.access_token;
}
async function readKey(key, accessToken) {
  const r = await fetch(DB + '/' + encodeURIComponent(key) + '.json', {
    headers: { Authorization: 'Bearer ' + accessToken },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error('Lectura de usuarios no disponible');
  const value = await r.json();
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const user = await verifyFirebaseIdToken(authorization.slice(7).trim());
    const accessToken = await serviceAccessToken(serviceAccount());
    // El rol se comprueba EN SERVIDOR contra el dato vigente: no basta con un
    // rol en localStorage ni con un claim antiguo.
    const roles = await readKey('lasala-roles-v1', accessToken);
    if (roles[user] !== 'ADMIN') return res.status(403).json({ error: 'FORBIDDEN' });
    const accounts = await readKey('lasala-users-v1', accessToken);
    const names = Array.from(new Set([...Object.keys(roles), ...Object.keys(accounts)])).sort((a,b) => a.localeCompare(b,'es'));
    const users = names.map(name => ({
      user: name,
      role: typeof roles[name] === 'string' ? roles[name] : 'SIN_ROL',
      accessConfigured: Object.prototype.hasOwnProperty.call(accounts, name)
    }));
    return res.status(200).json({ users, currentUser: user });
  } catch (err) {
    const status = err.httpStatus || 503;
    if (status === 503) console.error('admin-users:', err.message);
    return res.status(status).json({ error: status === 503 ? 'SERVICE_UNAVAILABLE' : status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED' });
  }
};
