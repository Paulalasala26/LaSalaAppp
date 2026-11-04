'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const gate=require('./prototype-push-worker-gate.cjs');
const SECRET='test-only-no-production-secret-x'.repeat(3);
const NOW=1793780000000;
const NONCE='0123456789012345678901234567';
function defaults(extra={}){
 const seen=new Set();
 const trace={calls:0,events:[],claims:0};
 const options={secret:SECRET,nowMs:NOW,
   claimNonce:async nonce=>{trace.claims++;if(seen.has(nonce))return false;seen.add(nonce);return true;},
   dispatchVerifiedEvent:async event=>{trace.calls++;trace.events.push(event);return {ok:true};},
   ...extra};
 return {trace,handle:gate.securePushHandler(options)};
}
const input={kind:'riego_problema',referenceId:'EV_1'};
async function request(fields=input,options={}){
 const {nonce=NONCE,nowMs=NOW,secret=SECRET,path='/dispatch',signature,contentType='application/json',raw}=options;
 const body=raw??JSON.stringify(fields);
 const message=gate.payloadForSignature(String(nowMs),nonce,body);
 const sig=signature??Buffer.from(await gate.sign(secret,message)).toString('hex');
 return new Request('https://push.example.test'+path,{
  method:'POST',headers:{'Content-Type':contentType,'X-Lasala-Timestamp':String(nowMs),
   'X-Lasala-Nonce':nonce,'X-Lasala-Signature':sig},body});
}
async function verify(result,expected){
 const response=await result;
 assert.equal(response.status,expected);
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 return await response.json();
}
test('valid server-signed event accepted, no raw target or text forwarded',async()=>{
 const {trace,handle}=defaults();
 const reply=await verify(handle(await request()),202);
 assert.deepEqual(reply,{ok:true,accepted:true});
 assert.deepEqual(trace.events,[input]);
 assert.equal(trace.calls,1);
});
test('anonymous POST is rejected before read, nonce reservation or send',async()=>{
 const {trace,handle}=defaults();
 const res=await handle(new Request('https://push.example.test/dispatch',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
 assert.equal(res.status,401);assert.equal(trace.calls,0);assert.equal(trace.claims,0);
});
test('invalid signature cannot call dispatch',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{signature:'0'.repeat(64)})),401);
 assert.equal(trace.calls,0);assert.equal(trace.claims,0);
});
test('signature bound to POST body; modified body is rejected',async()=>{
 const {trace,handle}=defaults();
 const signed=await request();
 const altered=JSON.stringify({kind:'riego_problema',referenceId:'EV_2'});
 const swapped=new Request(signed.url,{method:'POST',headers:signed.headers,body:altered});
 await verify(handle(swapped),401);assert.equal(trace.calls,0);
});
test('replay of a valid signature and nonce is rejected',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request()),202);
 const result=await verify(handle(await request()),409);
 assert.equal(result.error,'REPLAY_DETECTED');
 assert.equal(trace.calls,1);
});
test('expired signature rejected',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{nowMs:NOW-5*60*1000})),401);
 assert.equal(trace.calls,0);
});
test('future signature outside skew rejected',async()=>{
 const {handle}=defaults();
 await verify(handle(await request(input,{nowMs:NOW+5*60*1000})),401);
});
test('server secret mismatch is rejected',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{secret:'another-only-for-tests-secret'.repeat(3)})),401);
 assert.equal(trace.calls,0);
});
test('signed arbitrary target/title/body is still invalid',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request({...input,target:'ANOTHER',title:'Free text',body:'Free text'})),400);
 assert.equal(trace.calls,0);
});
test('signed invalid JSON is rejected',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{raw:'{broken'})),400);
 assert.equal(trace.calls,0);
});
test('GET request rejected; Worker not a public API',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(new Request('https://push.example.test/dispatch',{method:'GET'})),405);
 assert.equal(trace.calls,0);
});
test('OPTIONS request is not a CORS authorization shortcut',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(new Request('https://push.example.test/dispatch',{method:'OPTIONS'})),405);
 assert.equal(trace.calls,0);
});
test('wrong path cannot dispatch',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{path:'/other'})),404);
 assert.equal(trace.calls,0);
});
test('missing durable nonce claim capability fails closed',async()=>{
 const {trace,handle}=defaults({claimNonce:undefined});
 await verify(handle(await request()),503);
 assert.equal(trace.calls,0);
});
test('absent service secret fails closed',async()=>{
 const {trace,handle}=defaults({secret:undefined});
 await verify(handle(await request()),503);
 assert.equal(trace.calls,0);
});
test('missing authorized dispatch callback fails closed',async()=>{
 const {handle}=defaults({dispatchVerifiedEvent:undefined});
 await verify(handle(await request()),503);
});
test('failed delivery yields 503 and no success response',async()=>{
 const {handle}=defaults({dispatchVerifiedEvent:async()=>({ok:false})});
 const reply=await verify(handle(await request()),503);
 assert.equal(reply.error,'DELIVERY_FAILED');
});
test('oversized request cannot reach the dispatch callback',async()=>{
 const {trace,handle}=defaults();
 const huge=await request(input,{raw:'X'.repeat(2200)});
 await verify(handle(huge),413);
 assert.equal(trace.calls,0);
});
test('reject non-JSON content type',async()=>{
 const {trace,handle}=defaults();
 await verify(handle(await request(input,{contentType:'text/plain'})),415);
 assert.equal(trace.calls,0);
});
