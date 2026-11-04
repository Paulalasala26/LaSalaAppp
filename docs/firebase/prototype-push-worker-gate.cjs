'use strict';
// Cloudflare-Workers-compatible security GATE PROTOTYPE (WebCrypto).
// ISOLATED: no live Worker/REST/Firebase calls. Not a deployable Worker by itself.
// No anonymous browser API: a trusted backend must sign a server-generated event.
// The trusted backend must derive recipients from verified state, never a POST field.
const encoder=new TextEncoder();
const EVENT_RE=/^[a-z][a-z0-9_]{2,55}$/;
const REF_RE=/^[A-Za-z0-9_-]{1,140}$/;
const NONCE_RE=/^[A-Za-z0-9_-]{20,100}$/;
const TS_RE=/^[0-9]{13}$/;
const HEX_RE=/^[a-f0-9]{64}$/;
const MAX_BODY=2048;
const MAX_DRIFT_MS=2*60*1000;
function error(status,code){return {status,code};}
function fail(status,code){throw error(status,code);}
function constantTimeBytes(a,b){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
function hexBytes(hex){
  const o=new Uint8Array(hex.length/2);
  for(let i=0;i<o.length;i++)o[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return o;
}
async function sign(secret,input){
  if(typeof secret!=='string'||secret.length<32)fail(503,'DISPATCH_SECRET_MISSING');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(input));
  return new Uint8Array(bytes);
}
function payloadForSignature(ts,nonce,raw){
  return 'LASALA_PUSH_V1\nPOST\n/dispatch\n'+ts+'\n'+nonce+'\n'+raw;
}
async function authenticate(request,options){
  const secret=options?.secret;
  if(typeof secret!=='string'||secret.length<32)fail(503,'DISPATCH_SECRET_MISSING');
  if(typeof options?.claimNonce!=='function')fail(503,'NONCE_STORE_MISSING');
  if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
  const url=new URL(request.url);
  if(url.pathname!=='/dispatch')fail(404,'NOT_FOUND');
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))fail(415,'UNSUPPORTED_MEDIA_TYPE');
  const ts=request.headers.get('x-lasala-timestamp')||'';
  const nonce=request.headers.get('x-lasala-nonce')||'';
  const supplied=request.headers.get('x-lasala-signature')||'';
  if(!TS_RE.test(ts)||!NONCE_RE.test(nonce)||!HEX_RE.test(supplied))fail(401,'UNAUTHORIZED');
  const now=options?.nowMs??Date.now();
  if(!Number.isFinite(now)||Math.abs(now-Number(ts))>MAX_DRIFT_MS)fail(401,'EXPIRED_SIGNATURE');
  const lengthHeader=Number(request.headers.get('content-length')||0);
  if(lengthHeader>MAX_BODY)fail(413,'PAYLOAD_TOO_LARGE');
  const raw=await request.text();
  if(encoder.encode(raw).length>MAX_BODY)fail(413,'PAYLOAD_TOO_LARGE');
  const signature=await sign(secret,payloadForSignature(ts,nonce,raw));
  if(!constantTimeBytes(signature,hexBytes(supplied)))fail(401,'UNAUTHORIZED');
  let input;try{input=JSON.parse(raw)}catch(_){fail(400,'INVALID_JSON')}
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).sort().join('|')!=='kind|referenceId'||
    typeof input.kind!=='string'||!EVENT_RE.test(input.kind)||
    typeof input.referenceId!=='string'||!REF_RE.test(input.referenceId))
    fail(400,'INVALID_EVENT');
  // claimNonce must be an ATOMIC insert-if-absent in durable storage,
  // with TTL >= 2*MAX_DRIFT_MS; an in-memory Map is insufficient for production.
  const claimed=await options.claimNonce(nonce,now);
  if(claimed!==true)fail(409,'REPLAY_DETECTED');
  return {kind:input.kind,referenceId:input.referenceId};
}
function jsonResult(status,obj){
  return new Response(JSON.stringify(obj),{status,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff'
  }});
}
function securePushHandler(options){
  return async function handle(request){
    try{
      const event=await authenticate(request,options);
      if(typeof options?.dispatchVerifiedEvent!=='function')
        fail(503,'DISPATCH_NOT_CONFIGURED');
      // The callback MUST authorize event ownership, choose target from server data,
      // rate-limit, and deduplicate by event ID. Raw target/title/body are disallowed.
      const delivery=await options.dispatchVerifiedEvent(event);
      if(!delivery||delivery.ok!==true)fail(503,'DELIVERY_FAILED');
      return jsonResult(202,{ok:true,accepted:true});
    }catch(e){
      if(!e||typeof e.status!=='number')return jsonResult(503,{error:'SERVICE_UNAVAILABLE'});
      return jsonResult(e.status,{error:e.code});
    }
  };
}
module.exports={authenticate,securePushHandler,payloadForSignature,sign};
