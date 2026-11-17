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
  if(value!==undefined&&value!==null){
   const rendered=String(value);
   if(rendered!=='null'&&rendered!=='undefined')n.textContent=rendered;
  }
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
 function refsLabel(items,tipo){return items.filter(x=>x?.ref?.tipo===tipo).length;}
 const CATEGORY_LABELS={color:'Color',tamano:'Tamaño',sanidad:'Sanidad',flores:'Flores',raices:'Raíces'};
 const OPTION_LABELS={ok:'OK',noEvaluada:'No evaluada',verde:'Verde',amarillo:'Amarillo',
  verdeClaro:'Verde claro',grande:'Grande',pequeno:'Pequeño',enfermedad1:'Enfermedad 1',
  enfermedad2:'Enfermedad 2',enfermedad3:'Enfermedad 3',enfermedad4:'Enfermedad 4',
  si:'Sí',no:'No',pocaRaiz:'Poca raíz',raizVariedad:'Raíz en variedad'};
 function localDraftLines(item){
  const source=item.categorias||item.mediciones||{},lines=[];
  if(Number.isFinite(item.bandejasInspeccionadas))
   lines.push('Bandejas inspeccionadas: '+item.bandejasInspeccionadas);
  for(const [key,value] of Object.entries(source)){
   const label=CATEGORY_LABELS[key]||key;
   if(Array.isArray(value?.opciones)){
    const options=value.opciones.map(option=>{
     const name=OPTION_LABELS[option]||option;
     const pct=value.porcentajesEnfermedades?.[option];
     return Number.isFinite(pct)?name+' ('+pct+'%)':name;
    });
    if(Number.isFinite(value.porcentajeInvalidas))
     options.push('Porcentaje afectado '+value.porcentajeInvalidas+'%');
    lines.push(label+': '+(options.join(', ')||'—'));
   }else if(value&&typeof value==='object'){
    const active=Object.entries(value).filter(([,count])=>typeof count==='number'&&count>0)
     .map(([option,count])=>(OPTION_LABELS[option]||option)+': '+count);
    lines.push(label+': '+(active.join(', ')||'—'));
   }else lines.push(label+': '+String(value));
  }
  if(Number.isFinite(item.porcentajeInvalidasGlobal))
   lines.push('Porcentaje global: '+item.porcentajeInvalidasGlobal+'%');
  return lines.length?lines:['El borrador no contiene datos de evaluación legibles.'];
 }
 function show(){
  const anchor=$('avisos-sync-anchor')||$('qc-global-sync-anchor'),host=$('avisos-sync-panel')||$('qc-global-sync-panel');
  if(!anchor||!host)return;
  const state=snapshot();
  anchor.replaceChildren();host.replaceChildren();
  if(!user||!validSession()||!ALLOWED.has(role))return;
  const toggle=text('button',null,'avisos-modulo-boton qc-sync-trigger');
  toggle.type='button';
  toggle.setAttribute('aria-label',state.total?
    state.total+' elementos QC por sincronizar'+(state.photos.length?' · '+state.photos.length+' fotos pendientes':''):
    'Sin pendientes de sincronización QC');
  toggle.setAttribute('aria-expanded',String(opened));
  const glyph=document.createElement('i');
  glyph.className='ti '+(lastErrors.length?'ti-alert-triangle':'ti-upload');
  glyph.setAttribute('aria-hidden','true');
  toggle.append(glyph,text('span',state.total?String(state.total)+' por sincronizar':'Sin pendientes'));
  if(state.total){
    const dot=text('span');dot.className='qc-sync-dot';dot.setAttribute('aria-hidden','true');
    toggle.append(dot);
  }
  toggle.addEventListener('click',()=>{opened=!opened;show();});
  anchor.append(toggle);
  if(!opened)return;
  const panel=text('section',null,'qc-sync-panel');
  panel.setAttribute('aria-label','Sincronización de Control de Calidad');
  panel.append(text('h3','Sincronización pendiente'));
  panel.append(text('p',state.total?
    (navigator.onLine===false?'Sin conexión. Todo permanece en este dispositivo.':
      'Conexión disponible. Hay elementos pendientes de enviar o verificar.')+' Pendientes: '+state.total+'.':
    'No hay elementos QC pendientes guardados en este dispositivo.'));
  const desc=text('div',null,'qc-sync-details');
  const rows=[
   ['QC Túnel · Inspecciones',refsLabel(state.drafts,'tunel')],
   ['QC Carga normal · Inspecciones',refsLabel(state.drafts,'carga')],
   ['QC Túnel · Fotos',refsLabel(state.photos,'tunel')],
   ['QC Carga normal · Fotos',refsLabel(state.photos,'carga')]
  ];
  for(const [name,count]of rows){
   if(!count)continue;
   const row=text('div',null,'qc-sync-row');
   row.append(text('span',name),text('strong',String(count)));desc.append(row);
  }
  panel.append(desc);
  if(state.drafts.length){
   const local=text('div',null,'qc-sync-local-drafts');
   local.style.cssText='margin:12px 0;padding:10px;border:1px solid #c8d9e8;border-radius:10px;background:#fff';
   local.append(text('strong','Borradores de inspección guardados en este dispositivo'));
   for(const item of state.drafts){
    const details=text('details',null,'qc-sync-local-draft');
    details.style.cssText='margin-top:8px;padding:8px;border:1px solid #d5e2ee;border-radius:8px;background:#f7fbff';
    const kind=item.ref.tipo==='tunel'?'QC Túnel':'QC Carga normal';
    details.append(text('summary','Ver borrador local · '+kind+' · '+item.ref.partida+' ('+item.ref.id+')'));
    details.append(text('p',item.status==='ENVIO_INCIERTO'?
      'Estado: envío anterior por verificar. Vista de solo lectura; no se ha cambiado ningún dato.':
      'Estado: pendiente de sincronizar. Vista de solo lectura.'));
    for(const line of localDraftLines(item))details.append(text('p',line));
    local.append(details);
   }
   panel.append(local);
  }
  const uncertainDrafts=state.drafts.filter(x=>x.status==='ENVIO_INCIERTO').length;
  const uncertainPhotos=state.photos.filter(x=>x.status==='ENVIO_INCIERTO').length;
  if(uncertainDrafts){
    const n=uncertainDrafts;
    panel.append(text('p',n+' inspección'+(n===1?'':'es')+' con envío'+(n===1?' anterior':'s anteriores')+
      ' pendiente'+(n===1?'':'s')+' de verificar. Se comprobará'+(n===1?'':'n')+
      ' en el servidor QC antes de retirar el borrador local.','qc-sync-warning'));
  }
  if(uncertainPhotos){
    const n=uncertainPhotos;
    panel.append(text('p',n+' foto'+(n===1?'':'s')+' con envío'+(n===1?' anterior':'s anteriores')+
      ' pendiente'+(n===1?'':'s')+' de verificar. Se comprobará'+(n===1?'':'n')+
      ' en SharePoint antes de reintentar el archivo.','qc-sync-warning'));
  }
  const action=text('button',state.total?'Sincronizar todo':'Sin pendientes','qc-sync-action');
  action.type='button';action.disabled=busy||navigator.onLine===false||!state.total;
  action.addEventListener('click',()=>{void synchronize();});
  panel.append(action);
  const status=text('p',state.total?'Orden: inspecciones → servidor QC; fotos → SharePoint. Cada elemento se verifica antes de retirarlo del dispositivo.':'Se mostrará aquí cuando haya fotos o inspecciones guardadas para sincronizar.','qc-sync-status');
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
   void window.actualizarCampanaAvisos?.();
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
  void window.actualizarCampanaAvisos?.();
 }
 function stop(){
  runId++;user='';role='';opened=false;lastErrors=[];
  if(interval){clearInterval(interval);interval=null;}
  $('avisos-sync-anchor')?.replaceChildren();
  $('avisos-sync-panel')?.replaceChildren();
 }
 window.addEventListener('online',()=>{void refresh(true);});
 window.addEventListener('offline',show);
 window.addEventListener('focus',()=>{void refresh(true);});
 window.addEventListener('qc-local-updated',()=>{
  void refresh(true).then(()=>window.actualizarCampanaAvisos?.());
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh(true);});
 window.QCGlobalSync=Object.freeze({start,stop,refresh:()=>refresh(true),snapshot,synchronize});
})();
