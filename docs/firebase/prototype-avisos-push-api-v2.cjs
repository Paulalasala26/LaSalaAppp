'use strict';
// ISOLATED API-INTEGRATION PROTOTYPE. This is NOT a deployed api/ route.
// No real HTTP, Firebase, Push, timers, secrets or Vercel dependencies.
// Every storage adapter method below MUST enforce atomic CAS or insert-if-absent.
const crypto=require('node:crypto');
const core=require('./prototype-avisos-push-v2.cjs');
const ACTIONS=new Set(['mine','admin-list','mark-seen','mark-read','dismiss','evaluate','resolve',
  'push-register','push-unregister','push-status','emit-event']);
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const REMINDER=Object.freeze({
  scheduleUTC:'0 7 * * 4', recipients:Object.freeze(['DENNIS','FRAN']),
  title:'🐛 Conteo Tuta',message:'Hoy es jueves — toca hacer el conteo de Tuta.'
});
function fault(status,code){throw Object.assign(new Error(code),{status,code})}
function requireFields(obj,keys){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)||
    Object.keys(obj).sort().join('|')!==keys.slice().sort().join('|'))
    fault(400,'INVALID_FIELDS');
}
function response(status,value){return {status,body:value}}
const safe=e=>response(
  [400,401,403,404,405,409,413,503].includes(e?.status)?e.status:503,
  {error:typeof e?.code==='string'?e.code:'SERVICE_UNAVAILABLE'}
);
function bearer(headers){
  const h=headers?.authorization;
  if(typeof h!=='string'||!h.startsWith('Bearer ')||h.length<12)fault(401,'UNAUTHORIZED');
  return h.slice(7);
}
function requireMethods(storage,names){
  for(const name of names)if(typeof storage?.[name]!=='function')
    throw new TypeError('MISSING_STORAGE_ADAPTER:'+name);
}
function createAvisosPushApi({
  verifyIdentity,loadRole,loadAccount,authorizeEvent,storage,
  cronSecret=()=>undefined,now=()=>new Date()
}={}){
  for(const fn of [verifyIdentity,loadRole,loadAccount,authorizeEvent,cronSecret,now])
    if(typeof fn!=='function')throw new TypeError('MISSING_AUTH_DEPENDENCY');
  requireMethods(storage,['getOwnAlerts','getAlert','compareAndSwapAlert','getSubscription',
    'compareAndSwapSubscription','getSourceEvent','enqueueNotification','getAllAlerts',
    'enqueueWeeklyReminder']);
  async function currentActor(headers){
    const identity=await verifyIdentity(bearer(headers));
    if(!identity||typeof identity.appUser!=='string'||typeof identity.uid!=='string')
      fault(401,'UNAUTHORIZED');
    const [role,active]=await Promise.all([
      loadRole(identity.appUser),loadAccount(identity.appUser)
    ]);
    const context={...identity,role,active:active===true,verified:true};
    core.actor(context);
    return context;
  }
  async function weekly(req){
    if(req.headers?.['user-agent']!=='vercel-cron/1.0')
      fault(401,'UNAUTHORIZED');
    const secret=cronSecret();
    if(typeof secret!=='string'||secret.length<16)fault(503,'CRON_NOT_CONFIGURED');
    const supplied=req.headers?.authorization;
    const candidate=Buffer.from(typeof supplied==='string'?supplied:'','utf8');
    const expected=Buffer.from('Bearer '+secret,'utf8');
    if(candidate.length!==expected.length||!crypto.timingSafeEqual(candidate,expected))
      fault(401,'UNAUTHORIZED');
    if(Object.keys(req.query||{}).length>0)fault(400,'INVALID_QUERY');
    const moment=now();
    if(!(moment instanceof Date)||!Number.isFinite(moment.getTime()))
      fault(503,'CLOCK_UNAVAILABLE');
    // The Vercel schedule controls 07:00 UTC. The guard checks Thursday only;
    // day-key + atomic insert-if-absent prevents accidental repeated dispatch.
    if(moment.getUTCDay()!==4)fault(409,'NOT_REMINDER_DAY');
    const day=moment.toISOString().slice(0,10);
    const messages=[];
    for(const recipient of REMINDER.recipients){
      const [role,enabled]=await Promise.all([loadRole(recipient),loadAccount(recipient)]);
      if(enabled!==true||role!=='TECNICO')fault(503,'REMINDER_RECIPIENT_UNAVAILABLE');
      messages.push({recipientUid:core.uidForName(recipient),title:REMINDER.title,
        message:REMINDER.message,kind:'weekly_tuta',referenceId:'tuta_'+day});
    }
    const created=await storage.enqueueWeeklyReminder('weekly-tuta:'+day,messages);
    if(created!==true&&created!==false)fault(503,'REMINDER_STORE_FAILED');
    return response(created?202:200,{ok:true,queued:created?messages.length:0,duplicate:!created});
  }
  async function action(req){
    const body=req.body;
    if(!body||typeof body!=='object'||Array.isArray(body)||!ACTIONS.has(body.action))
      fault(400,'INVALID_ACTION');
    const context=await currentActor(req.headers);
    switch(body.action){
      case 'mine':{
        requireFields(body,['action']);
        const own=await storage.getOwnAlerts(context.uid);
        return response(200,{ok:true,avisos:core.ownAlerts({[context.uid]:own},context)});
      }
      case 'admin-list':{
        requireFields(body,['action']);
        if(context.role!=='ADMIN')fault(403,'FORBIDDEN');
        const all=await storage.getAllAlerts();
        // Admin-only response. Subscription secrets are never in this store.
        if(!all||typeof all!=='object'||Array.isArray(all))fault(503,'INVALID_STORE');
        return response(200,{ok:true,avisos:all});
      }
      case 'mark-seen':case 'mark-read':case 'dismiss':
      case 'evaluate':case 'resolve':{
        const keys=['action','id','expectedVersion'];
        if(['evaluate','resolve'].includes(body.action))
          keys.push(body.action==='evaluate'?'evaluation':'notes');
        requireFields(body,keys);
        const current=await storage.getAlert(context.uid,body.id);
        const data={[context.uid]:current?{[body.id]:current}:{}};
        const tx=core.editOwnAlert(data,context,{
          id:body.id,action:body.action,expectedVersion:body.expectedVersion,
          ...(body.action==='evaluate'?{evaluation:body.evaluation,notes:''}:{}),
          ...(body.action==='resolve'?{notes:body.notes}:{})
        });
        const changed=await storage.compareAndSwapAlert(tx.uid,tx.id,body.expectedVersion,tx.next);
        if(changed!==true)fault(409,'CONCURRENT_MODIFICATION');
        return response(200,{ok:true,version:tx.next.version});
      }
      case 'push-register':{
        requireFields(body,['action','subscription','consented']);
        const sid=core.endpointId(body.subscription?.endpoint||'');
        const prior=await storage.getSubscription(sid);
        const changed=core.registerPush(prior?{[sid]:prior}:{},context,body.subscription,{consented:body.consented});
        const success=await storage.compareAndSwapSubscription(sid,prior?.version??0,changed.entry);
        if(success!==true)fault(409,'CONCURRENT_MODIFICATION');
        return response(200,{ok:true,active:true});
      }
      case 'push-unregister':{
        requireFields(body,['action','endpoint']);
        const sid=core.endpointId(body.endpoint||'');
        const prior=await storage.getSubscription(sid);
        const change=core.unregisterPush(prior?{[sid]:prior}:{},context,body.endpoint);
        if(change.delete){
          const success=await storage.compareAndSwapSubscription(sid,prior.version,null);
          if(success!==true)fault(409,'CONCURRENT_MODIFICATION');
        }
        return response(200,{ok:true,active:false});
      }
      case 'push-status':{
        requireFields(body,['action','endpoint']);
        const sid=core.endpointId(body.endpoint||'');
        const prior=await storage.getSubscription(sid);
        return response(200,{ok:true,active:core.pushStatus(prior?{[sid]:prior}:{},context,body.endpoint)});
      }
      case 'emit-event':{
        requireFields(body,['action','kind','referenceId']);
        if(typeof body.referenceId!=='string'||!ID.test(body.referenceId))
          fault(400,'INVALID_REFERENCE');
        const source=await storage.getSourceEvent(body.kind,body.referenceId);
        // Required business authorization checks event author/ownership from DB.
        if(await authorizeEvent(context,body.kind,source)!==true)
          fault(403,'EVENT_FORBIDDEN');
        const notification=core.prepareNotification(context,
          {kind:body.kind,referenceId:body.referenceId},source);
        const eventKey=body.kind+':'+body.referenceId;
        const queued=await storage.enqueueNotification(eventKey,notification);
        if(queued!==true&&queued!==false)fault(503,'OUTBOX_FAILED');
        return response(queued?202:200,{ok:true,queued,duplicate:!queued});
      }
    }
    fault(400,'INVALID_ACTION');
  }
  return async function handler(req){
    try{
      if(req.method==='GET')return await weekly(req);
      if(req.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
      // Vercel Cron must never access the browser request path.
      if(req.headers?.['user-agent']==='vercel-cron/1.0')fault(405,'METHOD_NOT_ALLOWED');
      if(Object.keys(req.query||{}).length>0)fault(400,'INVALID_QUERY');
      return await action(req);
    }catch(e){return safe(e)}
  };
}
module.exports={createAvisosPushApi,REMINDER};
