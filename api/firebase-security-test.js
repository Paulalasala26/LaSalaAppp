const crypto = require('node:crypto');

const PROJECT='la-sala-app-test';
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
const TOKEN_AUD='https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const OAUTH_URL='https://oauth2.googleapis.com/token';
const OAUTH_SCOPE='https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

function b64(v){ return Buffer.from(v).toString('base64url'); }
function sign(sa,payload){
  const unsigned=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify(payload));
  return unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),sa.private_key).toString('base64url');
}
function serviceAccount(){
  const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'{}');
  if(sa.project_id!==PROJECT || !sa.client_email || !sa.private_key) throw new Error('service account TEST inválida');
  return sa;
}
async function googleToken(sa){
  const now=Math.floor(Date.now()/1000);
  const assertion=sign(sa,{iss:sa.client_email,scope:OAUTH_SCOPE,aud:OAUTH_URL,iat:now,exp:now+3600});
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const r=await fetch(OAUTH_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()});
  if(!r.ok) throw new Error('OAuth '+r.status);
  const j=await r.json();
  if(!j.access_token) throw new Error('OAuth sin token');
  return j.access_token;
}
function customToken(sa){
  const now=Math.floor(Date.now()/1000);
  return sign(sa,{
    iss:sa.client_email,sub:sa.client_email,aud:TOKEN_AUD,iat:now,exp:now+3600,
    uid:'lasala-security-selftest',
    claims:{appUser:'__SELFTEST__',role:'ADMIN'}
  });
}
async function selftest(){
  const sa=serviceAccount();
  const ex=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+API_KEY,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:customToken(sa),returnSecureToken:true})
  });
  const ej=await ex.json();
  if(!ex.ok || !ej.idToken) return {exchangeOk:false,status:ex.status,error:ej?.error?.message||'exchange'};
  const rd=await fetch(DB+'/lasala-roles-v1.json?auth='+encodeURIComponent(ej.idToken),{cache:'no-store'});
  const authenticatedReadOk=rd.ok;
  const del=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+API_KEY,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:ej.idToken})
  });
  return {exchangeOk:true,authenticatedReadOk,authenticatedReadStatus:rd.status,cleanupOk:del.ok};
}
async function applyRules(){
  const sa=serviceAccount();
  const access=await googleToken(sa);
  const rules={
    rules:{
      'lasala-users-v1':{'.read':false,'.write':false},
      'lasala-roles-v1':{
        '.read':"auth != null && auth.token.appUser != null",
        '.write':false
      },
      '$other':{
        '.read':"auth != null && auth.token.appUser != null",
        '.write':"auth != null && auth.token.appUser != null"
      }
    }
  };
  const r=await fetch(DB+'/.settings/rules.json?access_token='+encodeURIComponent(access),{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(rules)
  });
  const body=await r.text();
  if(!r.ok) throw new Error('Rules PUT '+r.status+' '+body.slice(0,160));
  return {rulesApplied:true,status:r.status};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET') return res.status(200).json(await selftest());
    if(req.method==='POST') return res.status(200).json(await applyRules());
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }catch(e){
    return res.status(500).json({error:String(e&&e.message||e).slice(0,240)});
  }
};
