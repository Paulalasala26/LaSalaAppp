'use strict';
/* QC 0.113 — sincronización centralizada del trabajo local (solo TEST).
 * No enviar nada sin pulsación y consentimiento del usuario. Cantidades
 * primero, fotografías después. Respeta los motores de verificación actuales.
 */
(function(){
 const ALLOWED=new Set(['ADMIN','TECNICO','CARGADOR']);
 let user='',role='',busy=false,opened=false,interval=null,lastErrors=[],runId=0;
 const $=id=>document.getElementById(id);
 const text=(tag,value,cls)=>{
  const n=document.createElement(tag);
  if(value!==undefined)n.textContent=String(value);
  if(cls)n.className=cls;
  return n;
 };
 const session=()=>window.QCPhotoMainSession?
  window.QCPhotoMainSession():
  (()=>{
    try{
     const x=JSON.parse(localStorage.getItem('lasala-sesion-v1')||'null');
     return {user:x?.user,role:localStorage.getItem('viguerapp-qc-offline-role-test-v1')};
    }catch(_){return null;}
  })();
 const validSession=()=>{const x=session();return !!x&&user===x.user&&role===x.role;};
 function snapshot(){
  const d=window.QCOfflineDraftEditor?.pendingGlobal?.()||[];
  const p=window.QCOfflinePhotos?.pendingGlobal?.()||[];
  return {drafts:d,photos:p,total:d.length+p.length,
   uncertain:d.filter(x=>x.status==='ENVIO_INCIERTO').length+
     p.filter(x=>x.status==='ENVIO_INCIERTO').length};
 }
 function refsLabel(items,tipo){return items.filter(x=>x.ref.tipo===tipo).length;}
 function show(){
  const anchor=$('qc-global-sync-anchor'),host=$('qc-global-sync-panel');
  if(!anchor||!host)return;
  const state=snapshot();
  anchor.replaceChildren();host.replaceChildren();
  if(!user||!validSession()||!ALLOWED.has(role))return;
  if(!state.total&&!lastErrors.length){opened=false;return;}
  const toggle=text('button',null,'qc-sync-badge');
  toggle.type='button';
  toggle.setAttribute('aria-label',state.total+' elementos QC pendientes de sincronizar');
  toggle.setAttribute('aria-expanded',String(opened));
  toggle.append(text('span',lastErrors.length?'!':'↥'),
    text('span',state.total?String(state.total)+' por sincronizar':'Revisar datos locales'));
  toggle.addEventListener('click',()=>{opened=!opened;show();});
  anchor.append(toggle);
  if(!opened)return;
  const panel=text('section',null,'qc-sync-panel');
  panel.setAttribute('aria-label','Sincronización de Control de Calidad');
  panel.append(text('h3','Sincronización pendiente'));
  panel.append(text('p',(navigator.onLine===false?'Sin conexión. Todo permanece en este dispositivo.':
    'Conexión disponible. Los elementos aún no se han enviado.')+
    ' Pendientes: '+state.total+'.'));
  const desc=text('div',null,'qc-sync-details');
  const rows=[
   ['QC Túnel · Inspecciones',refsLabel(state.drafts,'tunel')],
   ['QC Carga · Inspecciones',refsLabel(state.drafts,'carga')],
   ['QC Túnel · Fotos',refsLabel(state.photos,'tunel')],
   ['QC Carga · Fotos',refsLabel(state.photos,'carga')]
  ];
  for(const [name,count]of rows){
   if(!count)continue;
   const row=text('div',null,'qc-sync-row');
   row.append(text('span',name),text('strong',String(count)));desc.append(row);
  }
  panel.append(desc);
  if(state.uncertain)panel.append(text('p',
    state.uncertain+' envío(s) anterior(es) por verificar. No se repetirán sin revisión.','qc-sync-warning'));
  const action=text('button','Sincronizar todo','qc-sync-action');
  action.type='button';action.disabled=busy||navigator.onLine===false||!state.total;
  action.addEventListener('click',()=>{void synchronize();});
  panel.append(action);
  const status=text('p','Orden: inspecciones → fotos a SharePoint. Cada elemento se verifica antes de retirarlo del dispositivo.','qc-sync-status');
  status.id='qc-global-sync-status';status.setAttribute('role','status');panel.append(status);
  if(lastErrors.length){
    const errors=text('details',null,'qc-sync-errors');
    errors.open=true;errors.append(text('summary',lastErrors.length+' elementos requieren revisión'));
    for(const e of lastErrors.slice(0,15))errors.append(text('p',e));
    panel.append(errors);
  }
  host.append(panel);
 }
 function progress(message){
  const status=$('qc-global-sync-status');
  if(status)status.textContent=message;
 }
 async function refresh(force){
  if(busy||!user||!ALLOWED.has(role)||!validSession())return;
  const turn=runId;
  try{
   if(force){
    await Promise.all([
      window.QCOfflineDraftEditor?.init?.(user,role),
      window.QCOfflinePhotos?.init?.(user,role)
    ]);
   }
   if(turn===runId)show();
  }catch(e){if(turn===runId){opened=true;lastErrors=[e?.message||'No se pueden leer los pendientes locales.'];show();}}
 }
 async function synchronize(){
  if(busy||!validSession()||!ALLOWED.has(role))return;
  if(navigator.onLine===false){opened=true;show();return;}
  const state=snapshot();
  if(!state.total)return;
  if(!confirm('¿Sincronizar '+state.total+' elementos QC pendientes de este dispositivo?\n'+
   'Primero se verificarán las inspecciones y después las fotos en SharePoint. '+
   'Los conflictos se conservarán localmente para revisión.'))return;
  busy=true;opened=true;lastErrors=[];show();
  let resultDraft=null,resultPhotos=null;
  const identity=user+'|'+role;
  try{
   progress('Comprobando inspecciones QC…');
   resultDraft=await window.QCOfflineDraftEditor.syncGlobal(progress);
   if(!validSession()||user+'|'+role!==identity)
    throw Error('La sesión ha cambiado. Pendientes conservados en el dispositivo.');
   const blocking=resultDraft.blocked||[];
   progress('Verificando fotografías y SharePoint…');
   resultPhotos=await window.QCOfflinePhotos.syncGlobal(blocking,progress);
   lastErrors=[...(resultDraft.errors||[]),...(resultPhotos.errors||[])];
  }catch(e){lastErrors.push(e?.message||'Error de sincronización. Pendientes conservados.');}
  finally{
   busy=false;
   await refresh(true);
   opened=!!snapshot().total;
   show();
   const count=snapshot().total;
   if(count){
    progress(count+' pendiente(s) conservado(s) en el dispositivo.'+
      (lastErrors.length?' Revisa los errores antes de repetir.':''));
   }
  }
 }
 async function start(nextUser,nextRole){
  if(!ALLOWED.has(nextRole)||!nextUser){stop();return;}
  if(user!==nextUser||role!==nextRole){
   runId++;user=nextUser;role=nextRole;opened=false;lastErrors=[];
  }
  if(interval)clearInterval(interval);
  interval=setInterval(()=>{if(!document.hidden)void refresh(true);},15000);
  await refresh(true);
 }
 function stop(){
  runId++;user='';role='';opened=false;lastErrors=[];
  if(interval){clearInterval(interval);interval=null;}
  $('qc-global-sync-anchor')?.replaceChildren();
  $('qc-global-sync-panel')?.replaceChildren();
 }
 window.addEventListener('online',()=>{void refresh(true);});
 window.addEventListener('offline',show);
 window.addEventListener('focus',()=>{void refresh(true);});
 window.addEventListener('qc-local-updated',()=>{void refresh(true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
 window.QCGlobalSync=Object.freeze({start,stop,refresh:()=>refresh(true),snapshot,synchronize});
})();
