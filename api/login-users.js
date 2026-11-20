'use strict';
// Public login chooser for ViguerAPP TEST. Only usernames of active accounts;
// never returns password hashes or role information.
const crypto=require('node:crypto');
const PROJECT='la-sala-app-test';
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
const VALID_ROLES=new Set(['ADMIN','TECNICO','REGANTE','PEON','CARGADOR']);
const ACTIVE_HASH=/^[0-9a-f]{64}$/i;
const VALID_USER=/^[A-Z0-9][A-Z0-9._ -]{0,79}$/;
function serviceAccount(){
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('Firebase not configured');
  const sa=JSON.parse(raw);
  if(sa.project_id!==PROJECT || !sa.client_email || !sa.private_key)
    throw new Error('Wrong Firebase service account');
  return sa;
}
function b64(v){return Buffer.from(JSON.stringify(v)).toString('base64url');}
async function accessToken(sa){
  const now=Math.floor(Date.now()/1000);
  const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({
    iss:sa.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600
  });
  const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),sa.private_key).toString('base64url');
  const response=await fetch(TOKEN_URL,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion
    }).toString(),signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('Firebase OAuth unavailable');
  const data=await response.json();
  if(!data.access_token)throw new Error('Missing token');
  return data.access_token;
}
function parseMap(v){
  if(typeof v==='string')v=JSON.parse(v);
  if(!v || typeof v!=='object' || Array.isArray(v))
    throw new Error('Invalid Firebase data');
  return v;
}
async function readKey(key,token){
  const response=await fetch(DB+'/'+encodeURIComponent(key)+'.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('Firebase unavailable');
  return parseMap(await response.json());
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const token=await accessToken(serviceAccount());
    const [accounts,roles]=await Promise.all([
      readKey('lasala-users-v1',token),
      readKey('lasala-roles-v1',token)
    ]);
    const users=Object.keys(accounts).filter(user=>
      VALID_USER.test(user) && typeof accounts[user]==='string' &&
      ACTIVE_HASH.test(accounts[user]) && VALID_ROLES.has(roles[user])
    ).sort((a,b)=>a.localeCompare(b,'es'));
    return res.status(200).json({users});
  }catch(_){
    console.error('login-users: list unavailable');
    return res.status(503).json({error:'SERVICE_UNAVAILABLE'});
  }
};