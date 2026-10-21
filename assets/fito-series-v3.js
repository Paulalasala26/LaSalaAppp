// ViguerAPP / APP R v3 — TEST. Modelo de jornadas y primera aplicación por zona.
// Sin migración ni escrituras al cargar.
(function installFitoSeriesV3(){
'use strict';
const originalForm=window.showFitoManualForm;
const originalPanels=window.renderFmBulkPanels;
const originalEditCell=window.editarFitoManualDesdeCelda;
const originalEditSummary=window.editarResumenTratamiento;
const originalSummary=window.renderResumenQuincenaTratamientos;
const originalDelete=window.borrarFitoManual;
if(!originalForm||!window.saveFitoPatch)return;
const st={mode:'nuevo',edit:null,busy:false,uncertain:false};
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
const key=(inv,d,c)=>inv+'|'+d+'|'+c;
const dayISO=day=>fechaLocalISO(riegoDiaToDate(Number(day)));
const allCells=()=>{
 const out=[];
 Object.entries(fitoData).forEach(([inv,days])=>Object.entries(days||{}).forEach(([day,streets])=>Object.entries(streets||{}).forEach(([street,raw])=>{
  if(raw&&typeof raw==='object'&&raw.serieId&&raw.texto)out.push({inv,day:+day,street:+street,raw});
 })));
 return out;
};
const seriesCells=id=>allCells().filter(x=>x.raw.serieId===id);
function listSeries(){
 const map=new Map();
 allCells().forEach(x=>{
  const r=x.raw,date=r.fechaJornadaISO||dayISO(x.day);
  if(!map.has(r.serieId))map.set(r.serieId,{id:r.serieId,start:r.inicioSerieISO||date,last:date,text:r.texto,journals:new Set()});
  const s=map.get(r.serieId);
  if(date>s.last)s.last=date;
  s.journals.add(r.jornadaId||date);
 });
 return [...map.values()].sort((a,b)=>b.last.localeCompare(a.last));
}
const selectedSeries=()=>listSeries().find(s=>s.id===document.getElementById('fm-serie-id')?.value);
function adjustFirstDay(){
 const legacy=!!st.edit?.legacy;
 document.querySelectorAll('#fm-bulk-panels input[type="checkbox"]').forEach(c=>{
  if(!(c.getAttribute('onchange')||'').includes('.primerDia='))return;
  const l=c.closest('label');if(!l)return;
  l.style.display=legacy?'flex':'none';
  let info=l.nextElementSibling;
  if(!info||!info.classList.contains('fm-inicio-automatico')){
   info=document.createElement('div');info.className='fm-inicio-automatico';
   info.style.cssText='font-size:11px;color:#6a1b9a;margin-bottom:7px';
   l.insertAdjacentElement('afterend',info);
  }
  info.style.display=legacy?'none':'block';
  info.textContent='Primer día por calle: automático (según jornadas registradas).';
 });
}
function updateSeriesUI(copyProduct){
 const p=document.getElementById('fm-serie-v3');if(!p)return;
 p.querySelectorAll('input[name="fm-serie-modo"]').forEach(x=>{
  x.disabled=!!st.edit;x.checked=!st.edit&&x.value===st.mode;
 });
 const select=document.getElementById('fm-serie-select-wrap'),info=document.getElementById('fm-serie-info');
 select.style.display=(!st.edit&&st.mode==='continuar')?'block':'none';
 if(st.edit){
  info.textContent=st.edit.legacy?'Registro histórico sin vínculo automático.':
  'Editando una jornada del tratamiento iniciado el '+st.edit.start+'.';
 }else if(st.mode==='nuevo'){
  info.textContent='Nuevo tratamiento: se registrará su fecha de inicio global.';
 }else{
  const s=selectedSeries();
  info.textContent=s?'Inicio global '+s.start+' · '+s.journals.size+' jornada(s) existente(s).':'Selecciona un tratamiento anterior.';
  if(s&&copyProduct){
   const parsed=parsearTextoFito(s.text);
   const tr=document.getElementById('fm-trat'),ds=document.getElementById('fm-dosis');
   if(!tr.value)tr.value=parsed.trat;
   if(!ds.value)ds.value=parsed.dosis;
  }
 }
 adjustFirstDay();
}
window.elegirModoSerieFitoV3=modo=>{if(!st.edit){st.mode=modo==='continuar'?'continuar':'nuevo';updateSeriesUI(true);}};
window.elegirSerieFitoV3=()=>updateSeriesUI(true);
window.renderFmBulkPanels=function(){
 const v=originalPanels.apply(this,arguments);adjustFirstDay();return v;
};
window.showFitoManualForm=function(){
 st.mode='nuevo';st.edit=null;st.uncertain=false;
 const r=originalForm.apply(this,arguments);
 const content=document.querySelector('#fito-manual-overlay details.fm-accordion > div');
 if(!content)return r;
 const options=listSeries().map(s=>'<option value="'+esc(s.id)+'">'+esc(s.start+' · '+parsearTextoFito(s.text).trat.slice(0,65)+' · '+s.journals.size+' días')+'</option>').join('');
 const card=document.createElement('div');card.id='fm-serie-v3';
 card.style.cssText='padding:10px;background:#f6f9fe;border:1px solid #c6d9ee;border-radius:8px;display:flex;flex-direction:column;gap:8px';
 card.innerHTML='<div style="font-size:12px;color:#1558a0;font-weight:800">Seguimiento del tratamiento</div>'
 +'<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;font-weight:700">'
 +'<label><input type="radio" name="fm-serie-modo" value="nuevo" checked onchange="elegirModoSerieFitoV3(\'nuevo\')"> Nuevo tratamiento</label>'
 +'<label><input type="radio" name="fm-serie-modo" value="continuar" onchange="elegirModoSerieFitoV3(\'continuar\')"> Continuar tratamiento</label></div>'
 +'<div id="fm-serie-select-wrap" style="display:none"><select id="fm-serie-id" onchange="elegirSerieFitoV3()" style="width:100%;min-height:38px;padding:8px;border:1px solid #a8c4e8;border-radius:7px;background:#fff;font-size:12px"><option value="">— Selecciona un tratamiento anterior —</option>'
 +options+'</select>'
 +'<button type="button" onclick="verHistorialFitoV3(document.getElementById(\'fm-serie-id\').value)" style="margin-top:8px;padding:7px;border:1px solid #a8c4e8;border-radius:6px;background:#fff;color:#1558a0;font-size:12px">Ver jornadas anteriores</button></div>'
 +'<div id="fm-serie-info" style="font-size:11px;color:#1558a0"></div>';
 content.insertBefore(card,content.firstChild);
 updateSeriesUI(false);
 return r;
};
function setEditing(raw,records){
 st.edit=raw&&typeof raw==='object'&&raw.serieId&&raw.jornadaId
   ?{id:raw.serieId,jornadaId:raw.jornadaId,start:raw.inicioSerieISO,records,legacy:false}
   :{legacy:true,records};
 const day=document.getElementById('fm-dia');if(day)day.disabled=true;
 for(const p of records){
  const old=getFitoCellRaw(p.inv,p.day,p.streets[0]);
  const cfg=fmBulkConfig[p.inv];
  if(cfg&&old&&typeof old==='object'){
   cfg.primerDia=!!old.primerDia;
   cfg.esperaCarga=!!old.esperaCarga;
   cfg.orden=old.orden??null;
  }
 }
 originalPanels();updateSeriesUI(false);
}
window.editarFitoManualDesdeCelda=function(inv,day,streets){
 const raw=getFitoCellRaw(inv,day,streets[0]);
 const result=originalEditCell.apply(this,arguments);
 setEditing(raw,[{inv:String(inv),day:+day,streets:[...streets]}]);
 return result;
};
window.editarResumenTratamiento=function(mod,idx){
 const f=resumenQuincenaFilasCache[mod]?.[idx],r=originalEditSummary.apply(this,arguments);
 if(mod==='fito'&&f){
  const rows=Object.entries(f.porInv).map(([inv,byObs])=>({inv,day:f.dia,streets:[...new Set(Object.values(byObs).flat())]}));
  setEditing(f.raw,rows);
 }
 return r;
};
window.verHistorialFitoV3=function(id){
 const entries=seriesCells(id);
 if(!entries.length){showToast('No hay jornadas vinculadas');return;}
 const firstDateByZone=new Map();
 entries.forEach(e=>{
  const zone=e.inv+'|'+e.street,iso=e.raw.fechaJornadaISO||dayISO(e.day);
  if(!firstDateByZone.has(zone)||iso<firstDateByZone.get(zone))firstDateByZone.set(zone,iso);
 });
 const byJournal=new Map();
 entries.forEach(e=>{
  const date=e.raw.fechaJornadaISO||dayISO(e.day),code=e.raw.jornadaId||date;
  if(!byJournal.has(code))byJournal.set(code,{date,examples:e.raw.texto,inv:new Map()});
  const j=byJournal.get(code);
  if(!j.inv.has(e.inv))j.inv.set(e.inv,new Set());
  j.inv.get(e.inv).add(e.street);
 });
 const rangeText=streets=>{
  const list=[...streets].map(Number).sort((a,b)=>a-b),sections=[];
  if(!list.length)return '—';
  let from=list[0],to=list[0];
  for(let i=1;i<=list.length;i++){
   const n=list[i];
   if(i<list.length&&n===to+1){to=n;continue;}
   sections.push(from===to?String(from):from+'–'+to);
   from=n;to=n;
  }
  return sections.join(', ');
 };
 const dates=[...byJournal.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const modal=getOrCreateOverlay('fm-serie-historial-v3');modal.style.zIndex=2200;
 const detail=dates.map(j=>{
  let firstCount=0;
  const invDetails=[...j.inv].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([inv,streets])=>{
   const beginnings=[],continuations=[];
   streets.forEach(street=>{
    const isFirst=firstDateByZone.get(inv+'|'+street)===j.date;
    if(isFirst)beginnings.push(street);else continuations.push(street);
   });
   firstCount+=beginnings.length;
   return '<div style="font-size:12px;line-height:1.6;margin-top:5px">'
    +'<b>INV '+esc(inv)+'</b> · '+streets.size+' calle(s)'
    +(beginnings.length?'<div style="color:#6a1b9a">Primer día: '+esc(rangeText(beginnings))+'</div>':'')
    +(continuations.length?'<div>Continúan: '+esc(rangeText(continuations))+'</div>':'')
    +'</div>';
  }).join('');
  return '<div style="border:1px solid #c6d9ee;border-radius:8px;padding:10px;margin-bottom:8px">'
   +'<strong>'+esc(j.date)+'</strong> · '+firstCount+' calle(s) que empiezan'
   +'<div style="font-size:12px;margin:5px 0">'+esc(j.examples)+'</div>'+invDetails+'</div>';
 }).join('');
 modal.innerHTML='<div style="background:#fff;border-radius:10px;width:min(600px,96vw);max-height:88vh;overflow:auto">'
 +'<div class="control-ui-header" style="padding:10px"><b>Tratamiento · inicio global '+esc(entries[0].raw.inicioSerieISO)+'</b><button class="control-ui-close" onclick="document.getElementById(\'fm-serie-historial-v3\').style.display=\'none\'">×</button></div>'
 +'<div style="padding:14px"><p style="font-size:12px">Jornadas registradas; no implica ejecución confirmada.</p>'+detail+'</div></div>';
 modal.style.display='flex';
};
window.renderResumenQuincenaTratamientos=function(mod){
 const s=originalSummary.apply(this,arguments);if(mod!=='fito')return s;
 const list=listSeries(),rows=list.slice(0,80).map(x=>
 '<button type="button" onclick="verHistorialFitoV3(\''+esc(x.id)+'\')" style="width:100%;display:flex;justify-content:space-between;text-align:left;padding:9px;border:none;border-bottom:1px solid #dce4ed;background:#fff;color:#1558a0;font-size:12px;cursor:pointer">'
 +'<span>'+esc(x.start+' · '+parsearTextoFito(x.text).trat.slice(0,55))+'</span><span>'+x.journals.size+' jornadas</span></button>').join('');
 const extra=list.length?'<details style="border:1px solid #c6d9ee;border-radius:8px;margin-bottom:10px;background:#fff"><summary style="padding:12px;color:#1558a0;font-weight:800">Tratamientos vinculados · '+list.length+' (todas las quincenas)</summary>'+rows+'</details>':'';
 return s.replace('<div id="resumen-quincena-fito">','<div id="resumen-quincena-fito">'+extra).replace('Aplicado en esta quincena','Registrado en esta quincena');
};
function gatherTargets(ids){
 return ids.map(inv=>{
  const r=calcularCallesFmBulk(inv),notes=new Map(),valid=new Set([...INV_LAYOUT[inv].row1,...INV_LAYOUT[inv].row2]);
  (r.tramos||[]).forEach(t=>{
   for(let c=Math.min(t.desde,t.hasta);c<=Math.max(t.desde,t.hasta);c++){
    if(!valid.has(c))continue;
    if(notes.has(c)&&notes.get(c)!==(t.obs||''))throw Error('Tramos solapados con distinta observación: INV '+inv+', calle '+c);
    notes.set(c,t.obs||'');
   }
  });
  return {inv,streets:[...new Set(r.calles)].sort((a,b)=>a-b),notes};
 }).filter(x=>x.streets.length);
}
window.saveFitoManual=async function(){
 if(st.busy||st.uncertain)return;
 st.busy=true;
 const btn=document.querySelector('#fito-manual-overlay footer button[onclick="saveFitoManual()"]');
 if(btn)btn.disabled=true;
 try{
  if(fitoDirtyCells.size)throw Error('Hay cambios pendientes de sincronizar. No se puede iniciar otro guardado.');
  const day=+document.getElementById('fm-dia').value,iso=dayISO(day);
  const product=document.getElementById('fm-trat').value.trim(),dose=document.getElementById('fm-dosis').value.trim();
  const time=document.getElementById('fm-horario').value||'',method=document.getElementById('fm-tipo-trat').value||'';
  const liters=+document.getElementById('fm-caldo').value||null;
  const caldoLabel=liters==null?'':(FITO_CALDO_OPCIONES.find(v=>v.litros===liters)||{}).label||'';
  if(!product)throw Error('Indica el tratamiento');
  const targets=gatherTargets(leerInvernaderosBulkSeleccionados('fm'));
  const total=targets.reduce((n,x)=>n+x.streets.length,0);
  if(!total)throw Error('Selecciona al menos una calle');
  const originals=st.edit?.records||[];
  if(originals.some(x=>x.day!==day))throw Error('La fecha de una jornada existente está bloqueada. Registra una nueva jornada.');
  let serieId=null,jornadaId=null,start=null;
  if(st.edit&&!st.edit.legacy){serieId=st.edit.id;jornadaId=st.edit.jornadaId;start=st.edit.start;}
  else if(!st.edit&&st.mode==='continuar'){
   const s=selectedSeries();if(!s)throw Error('Selecciona un tratamiento anterior');
   serieId=s.id;start=s.start;
  }else if(!st.edit){serieId='fito_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);start=iso;}
  if(start&&iso<start)throw Error('La nueva jornada no puede ser anterior al inicio global.');
  if(serieId&&!jornadaId)jornadaId='jornada_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  if(method==='Pistola'&&new Set(targets.map(x=>salaDeInv(x.inv))).size>1)throw Error('Pistola: las distintas salas necesitan asignación separada.');
  if(st.edit&&(method==='Pistola'||originals.some(x=>x.streets.some(c=>getFitoCellRaw(x.inv,x.day,c)?.tipoTrat==='Pistola'))))
   throw Error('La edición de jornadas Pistola queda protegida hasta sincronizar sus tareas (bloque C).');
  const own=new Set(originals.flatMap(x=>x.streets.map(c=>key(x.inv,x.day,c))));
  const destinations=new Set(targets.flatMap(x=>x.streets.map(c=>key(x.inv,day,c))));
  const removed=originals.flatMap(x=>x.streets.filter(c=>!destinations.has(key(x.inv,x.day,c))).map(c=>({inv:x.inv,day:x.day,street:c})));
  const expect=new Map();
  function capture(inv,d,c){const k=key(inv,d,c);if(!expect.has(k))expect.set(k,{invId:inv,dia:d,calle:c,raw:clone(getFitoCellRaw(inv,d,c))});}
  if(serieId)seriesCells(serieId).forEach(x=>capture(x.inv,x.day,x.street));
  targets.forEach(x=>x.streets.forEach(c=>{
   capture(x.inv,day,c);
   if(getFitoCellRaw(x.inv,day,c)&&!own.has(key(x.inv,day,c)))throw Error('La calle '+c+' del INV '+x.inv+' ya tiene un tratamiento. No se sobrescribe.');
  }));
  removed.forEach(x=>capture(x.inv,x.day,x.street));
  if(!(await loadEspecificosInvsData(targets.map(x=>x.inv),false)))throw Error('No se ha podido comprobar Específicos.');
  for(const x of targets)for(const c of x.streets){
   if(calleTieneEspecifico(x.inv,day,c)){
    const raw=getEspecificoCellRaw(x.inv,day,c),v=typeof raw==='string'?raw:raw?.texto||'';
    if(!/POR LA MAÑANA/i.test(v))throw Error('Conflicto con Específico de tarde: INV '+x.inv+', calle '+c);
   }
  }
  const places=targets.map(x=>'INV '+x.inv+' ('+x.streets.length+' calles)').join(', ');
  if(!confirm((st.edit?'Modificar jornada':'Registrar jornada')+' '+iso+' · '+product+'\n'+places+'\n'+(start?'Inicio global: '+start+'\n':'')+'No confirma la aplicación física.'))return;
  const text=[dose?product+' '+dose:product,time].filter(Boolean).join(' ');
  const undo=targets.map(x=>({invId:x.inv,dia:day,calles:x.streets}));
  removed.forEach(x=>undo.push({invId:x.inv,dia:x.day,calles:[x.street]}));
  registrarUndoFitoMultiInv(undo);
  for(const x of targets)for(const c of x.streets){
   const note=x.notes.get(c)||'',value=note?text+' — '+note:text,cfg=fmBulkConfig[x.inv]||{};
   const extra={caldoLitros:liters,caldoLabel,tipoTrat:method,primerDia:st.edit?.legacy?!!cfg.primerDia:false,esperaCarga:!!cfg.esperaCarga,orden:cfg.orden??null};
   if(serieId)Object.assign(extra,{serieId,jornadaId,inicioSerieISO:start,fechaJornadaISO:iso,estadoRegistro:'registrado'});
   setFito(x.inv,day,c,value,extra);
  }
  removed.forEach(x=>setFito(x.inv,x.day,x.street,''));
  if(serieId){
   const rows=seriesCells(serieId),starts=new Map();
   rows.forEach(x=>{
    const zone=x.inv+'|'+x.street,when=x.raw.fechaJornadaISO||dayISO(x.day);
    if(!starts.has(zone)||when<starts.get(zone))starts.set(zone,when);
   });
   rows.forEach(x=>{
    const first=(x.raw.fechaJornadaISO||dayISO(x.day))===starts.get(x.inv+'|'+x.street);
    if(x.raw.primerDia!==first){x.raw.primerDia=first;marcarFitoDirtyCell(x.inv,x.day,x.street);}
   });
  }
  completarUndoFitoParaTodosGrupos();
  const deletes=removed.map(x=>({invId:x.inv,dia:x.day,calles:[x.street]}));
  const saved=await saveFitoPatch(deletes,[...expect.values()]);
  if(!saved.ok){
   st.uncertain=true;
   showToast('Guardado sin confirmar. No repitas; comprueba el servidor antes de continuar.');
   return;
  }
  if(method==='Pistola'&&!st.edit){
   try{
    const objectives=[];
    targets.forEach(x=>agruparCallesEnTramos(x.streets).forEach(t=>objectives.push({invId:x.inv,callesLabel:formatRangoConInv(x.inv,t.desde,t.hasta)})));
    await autoAsignarTareaFumigacion(objectives,day,[product,dose].filter(Boolean).join(' '),time,{producto:product,dosis:dose,caldoLitros:liters,caldoLabel});
   }catch(e){showToast('Jornada guardada. Revisa la asignación de la tarea.');}
  }
  document.getElementById('fito-manual-overlay').style.display='none';
  if(fitoInvSel)renderFitoGrid(fitoInvSel);
  showToast('✓ Jornada '+iso+' registrada · '+total+' calles. Inicio global '+(start||'no vinculado'));
 }catch(e){showToast(String(e?.message||e));}
 finally{st.busy=false;if(btn)btn.disabled=st.uncertain;}
};
window.borrarFitoManual=function(){
 if(st.edit&&!st.edit.legacy){showToast('Borrado de jornada vinculada bloqueado hasta incorporar la protección del bloque B.');return;}
 return originalDelete.apply(this,arguments);
};
})();
