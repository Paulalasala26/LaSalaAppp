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
  if(x.raw.estadoRegistro==='anulado')return;
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

function editFullLinkedJournal(raw){
 if(raw.estadoRegistro==='anulado'){showToast('Jornada anulada; consulta el histórico.');return;}
 const rows=seriesCells(raw.serieId).filter(x=>x.raw.jornadaId===raw.jornadaId);
 if(!rows.length){showToast('Jornada no encontrada. Recarga el listado.');return;}
 const day=rows[0].day;
 if(rows.some(x=>x.day!==day)){
  showToast('Esta jornada contiene fechas distintas. Requiere revisión antes de editar.');
  return;
 }
 const configurations={};
 const profiles=new Map();
 const byInv=new Map();
 const expectedMix=parsearTextoFito(raw.texto);
 for(const x of rows){
  const parsed=parsearTextoFito(x.raw.texto);
  if(parsed.trat!==expectedMix.trat||parsed.dosis!==expectedMix.dosis||parsed.horario!==expectedMix.horario||x.raw.tipoTrat!==raw.tipoTrat||x.raw.caldoLitros!==raw.caldoLitros){
   showToast('La jornada tiene productos, método o caldo diferentes. No se editará en bloque.');
   return;
  }
  if(!byInv.has(x.inv))byInv.set(x.inv,[]);
  byInv.get(x.inv).push(x);
  const cfgKey=x.inv;
  const values=JSON.stringify([!!x.raw.esperaCarga,x.raw.orden??null]);
  if(profiles.has(cfgKey)&&profiles.get(cfgKey)!==values){
   showToast('La jornada contiene distintas opciones de espera u orden dentro de un mismo invernadero. Revisa el registro.');
   return;
  }
  profiles.set(cfgKey,values);
 }
 const records=[];
 for(const [inv,items] of byInv){
  const perObservation=new Map();
  for(const x of items){
   const parsed=parsearTextoFito(x.raw.texto),obs=parsed.obs||'';
   if(!perObservation.has(obs))perObservation.set(obs,[]);
   perObservation.get(obs).push(x.street);
  }
  const sections=[];
  for(const [obs,streets] of perObservation){
   const contiguous=agruparCallesEnTramos([...new Set(streets)]);
   contiguous.forEach(t=>sections.push({desde:t.desde,hasta:t.hasta,obs}));
  }
  const first=items[0].raw;
  configurations[inv]={modo:'tramo',excluir:{desde:null,hasta:null},primerDia:!!first.primerDia,
   esperaCarga:!!first.esperaCarga,orden:first.orden??null,tramos:sections};
  records.push({inv,day,streets:[...new Set(items.map(x=>x.street))]});
 }
 const firstInv=records[0].inv;
 fitoInvSel=firstInv;
 fmPendingConfig=null;
 fmPendingBulkConfig=configurations;
 window.showFitoManualForm();
 const set=(id,value)=>{const field=document.getElementById(id);if(field)field.value=value??'';};
 set('fm-dia',String(day));set('fm-trat',expectedMix.trat);
 set('fm-dosis',expectedMix.dosis);set('fm-horario',expectedMix.horario);
 set('fm-caldo',raw.caldoLitros??'');set('fm-tipo-trat',raw.tipoTrat||'');
 setEditing(raw,records);
 // The full-journal editor bypasses the old cell/summary editors: explicitly
 // flag edit mode so the header and the protected delete action remain available.
 fmEditContextoOriginal={invId:records[0].inv,dia:day,calles:[...records[0].streets]};
 actualizarAccionesFitoManual();
 // Una jornada Pistola se anula lógicamente, nunca se borra como un tratamiento antiguo.
 const btnAnular=document.getElementById('fm-btn-borrar');
 if(btnAnular&&raw.tipoTrat==='Pistola'){
  btnAnular.title='Anular la jornada y conservar su histórico y la tarea vinculada';
  btnAnular.innerHTML='<i class="ti ti-archive" aria-hidden="true"></i> Anular jornada';
 }
}
window.editarFitoManualDesdeCelda=function(inv,day,streets){
 const raw=getFitoCellRaw(inv,day,streets[0]);
 if(raw&&typeof raw==='object'&&raw.serieId&&raw.jornadaId){
  return editFullLinkedJournal(raw);
 }
 const result=originalEditCell.apply(this,arguments);
 setEditing(raw,[{inv:String(inv),day:+day,streets:[...streets]}]);
 return result;
};
window.editarResumenTratamiento=function(mod,idx){
 const f=resumenQuincenaFilasCache[mod]?.[idx];
 if(mod==='fito'&&f?.raw?.serieId&&f?.raw?.jornadaId){
  return editFullLinkedJournal(f.raw);
 }
 const r=originalEditSummary.apply(this,arguments);
 if(mod==='fito'&&f){
  const rows=Object.entries(f.porInv).map(([inv,byObs])=>({inv,day:f.dia,streets:[...new Set(Object.values(byObs).flat())]}));
  setEditing(f.raw,rows);
 }
 return r;
};
// Print a single saved journal, never an entire linked series. Split distinct
// preparations by product/dose/time, method, broth and fixed-tank rules.
function buildPrintJobsV3(records){
 if(!records.length)return [];
 const dateSet=new Set(records.map(e=>e.raw.fechaJornadaISO||dayISO(e.day)));
 if(dateSet.size!==1)return []; // Corrupt journal ID with different dates: do not print ambiguously.
 const groups=new Map();
 for(const e of records){
  const r=e.raw,parsed=parsearTextoFito(r.texto||'');
  const fixed=grupoCubaDeInv(e.inv);
  // Same rules as renderResumenQuincenaTratamientos: ecological Sala 1
  // never mixes; Cañón is not bound to other fixed tanks.
  const tank=fixed==='S1_ECO'?'S1_ECO'
   :r.tipoTrat==='Cañón'?'CANON'
   :/CUBA DE RUEDAS/i.test(r.caldoLabel||'')?'RUEDAS':fixed;
  const liters=r.caldoLitros==null?null:Number(r.caldoLitros);
  const date=r.fechaJornadaISO||dayISO(e.day);
  const signature=JSON.stringify([date,parsed.trat,parsed.dosis,parsed.horario,r.tipoTrat||'',r.caldoLabel||'',liters,tank]);
  if(!groups.has(signature))groups.set(signature,{
   signature,date,parsed,method:r.tipoTrat||'',liters,broth:r.caldoLabel||'',areas:new Map(),members:[]
  });
  const g=groups.get(signature);
  g.members.push(JSON.stringify([e.inv,e.day,e.street,r]));
  // Options are per area, not per journal: preserve street-level exceptions.
  const areaKey=JSON.stringify([e.inv,!!r.esperaCarga,r.orden??null]);
  if(!g.areas.has(areaKey))g.areas.set(areaKey,{
   inv:e.inv,esperaCarga:!!r.esperaCarga,orden:r.orden??null,streets:new Set()
  });
  g.areas.get(areaKey).streets.add(e.street);
 }
 return [...groups.values()].map(g=>{
  const areas=[...g.areas.values()].sort((a,b)=>
   (a.orden==null?Number.MAX_SAFE_INTEGER:Number(a.orden))-(b.orden==null?Number.MAX_SAFE_INTEGER:Number(b.orden))
   || a.inv.localeCompare(b.inv,'es',{numeric:true}));
  const objetivos=areas.map(a=>({
   inv:a.inv,calles:formatCallesConEnteroParaImprimir(a.inv,[...a.streets].sort((a,b)=>a-b)),
   orden:a.orden,esperaCarga:a.esperaCarga
  }));
  return {
   signature:g.signature,identity:JSON.stringify(g.members.sort()),
   datos:{
    producto:g.parsed.trat,dosis:g.parsed.dosis,horario:g.parsed.horario,
    tipoTrat:g.method,caldoLitros:g.liters,caldoLabel:g.broth,
    fechaISO:g.date,objetivos
   },
   label:[g.method||'Sin método',[...new Set(areas.map(a=>a.inv))].map(x=>'INV '+x).join(', ')].join(' · ')
  };
 });
}

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
  if(!byJournal.has(code))byJournal.set(code,{code,date,examples:e.raw.texto,inv:new Map(),records:[]});
  const j=byJournal.get(code);
  j.records.push(e);
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
   +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
   +'<strong>'+esc(j.date)+'</strong><span style="font-size:12px">'+firstCount+' calle(s) que empiezan</span></div>'
   +'<div style="font-size:12px;margin:5px 0">'+esc(j.examples)+'</div>'+invDetails+'</div>';
 }).join('');
 modal.innerHTML='<div style="background:#fff;border-radius:10px;width:min(600px,96vw);max-height:88vh;overflow:auto">'
 +'<div class="control-ui-header" style="padding:10px"><b>Tratamiento · inicio global '+esc(entries[0].raw.inicioSerieISO)+'</b><button class="control-ui-close" onclick="document.getElementById(\'fm-serie-historial-v3\').style.display=\'none\'">×</button></div>'
 +'<div style="padding:14px">'+detail+'</div></div>';
 modal.style.display='flex';
};
function limpiarBusquedaFitoV3(v){
 return String(v??'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
let busquedaFitoV3='';
function construirConsultaFitoV3(mod){
 if(mod!=='fito')return originalSummary.apply(this,arguments);
 // Original agrupación remains the single source for historical/unlinked
 // cards and legacy edit IDs; never render its duplicated dashboard.
 originalSummary.apply(this,arguments);
 const dias=riegoQuincenaDias(fitoQuincenaOffset);
 const porDia=new Set(dias.map(Number));
 const filtroDia=resumenQuincenaDiaFiltro.fito;
 const filtroSala=resumenQuincenaSalaFiltro.fito;
 const filtroInv=resumenQuincenaInvFiltro.fito;
 const rows=[];
 const linked=new Map();
 allCells().forEach(c=>{
  if(!porDia.has(c.day)||filtroDia!=null&&c.day!==filtroDia)return;
  const r=c.raw;
  const id=JSON.stringify([r.serieId,r.jornadaId||r.fechaJornadaISO||dayISO(c.day),c.day]);
  if(!linked.has(id))linked.set(id,{kind:'linked',serieId:r.serieId,jornadaId:r.jornadaId||r.fechaJornadaISO||dayISO(c.day),day:c.day,items:[]});
  linked.get(id).items.push(c);
 });
 for(const j of linked.values()){
  const invIds=[...new Set(j.items.map(c=>c.inv))];
  if(filtroSala&&!invIds.some(inv=>salaDeInv(inv)===filtroSala))continue;
  if(filtroInv&&!invIds.includes(filtroInv))continue;
  const first=j.items[0].raw,parsed=parsearTextoFito(first.texto);
  j.title=parsed.trat||first.texto;
  j.anulada=j.items.every(x=>x.raw.estadoRegistro==='anulado');
  j.dose=parsed.dosis||'';
  j.time=parsed.horario||'';
  j.start=first.inicioSerieISO||dayISO(j.day);
  j.method=[...new Set(j.items.map(e=>e.raw.tipoTrat).filter(Boolean))].join(' / ');
  j.broth=[...new Set(j.items.map(e=>e.raw.caldoLabel).filter(Boolean))].join(' / ');
  j.invIds=invIds.sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  j.count=j.items.length;
  const byInv=new Map();
  for(const e of j.items){
   if(!byInv.has(e.inv))byInv.set(e.inv,[]);
   byInv.get(e.inv).push(e);
  }
  const locations=[];
  const searchLocations=[];
  for(const [inv,entries] of [...byInv].sort(([a],[b])=>a.localeCompare(b,'es',{numeric:true}))){
   const all=[...new Set(entries.map(e=>e.street))].sort((a,b)=>a-b);
   searchLocations.push('INV '+inv+' '+all.join(' '));
   const firstStreets=entries.filter(e=>!!e.raw.primerDia).map(e=>e.street);
   const further=entries.filter(e=>!e.raw.primerDia).map(e=>e.street);
   const lines=[];
   lines.push('<div style="font-weight:750">INV '+esc(inv)+' · '+esc(formatCallesConEnteroParaImprimir(inv,all))+'</div>');
   if(firstStreets.length)lines.push('<span style="color:#6a1b9a">Primer día: '+esc(formatCallesConEnteroParaImprimir(inv,firstStreets))+'</span>');
   if(further.length)lines.push('<span>Continúan: '+esc(formatCallesConEnteroParaImprimir(inv,further))+'</span>');
   locations.push('<div style="box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid #dce6f2;border-radius:8px;background:#fff;display:flex;flex-direction:column;gap:3px;font-size:12px;line-height:1.5">'+lines.join('')+'</div>');
  }
  j.detail=locations.join('');
  j.location=j.invIds.map(inv=>'INV '+inv).join(', ');
  j.search=[j.title,j.dose,j.time,j.method,j.start,j.day,j.location,searchLocations.join(' '),j.anulada?'Anulada':''].join(' ');
  rows.push(j);
 }
 const cache=resumenQuincenaFilasCache.fito||[];
 cache.forEach((f,idx)=>{
  if(f.raw&&typeof f.raw==='object'&&f.raw.serieId)return; // already represented as one linked journal
  const parsed=parsearTextoFito(f.texto);
  const invs=Object.keys(f.porInv||{}).sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  let ranges=[];
  for(const inv of invs){
   const byObs=f.porInv[inv];
   const calles=[...new Set(Object.values(byObs).flat().map(Number))].sort((a,b)=>a-b);
   ranges.push('<div style="box-sizing:border-box;width:100%;padding:9px 11px;border:1px solid #dce6f2;border-radius:8px;background:#fff;font-size:12px;line-height:1.5">'
     +'<b>INV '+esc(inv)+'</b> · '+esc(formatCallesConEnteroParaImprimir(inv,calles))+'</div>');
  }
  rows.push({
   kind:'legacy',idx,day:f.dia,title:parsed.trat||f.texto,dose:parsed.dosis||'',
   time:parsed.horario||'',method:f.raw?.tipoTrat||'',broth:f.raw?.caldoLabel||'',
   location:invs.map(x=>'INV '+x).join(', '),detail:ranges.join(''),
   count:Object.values(f.porInv||{}).reduce((n,v)=>n+new Set(Object.values(v).flat()).size,0),
   search:[f.texto,parsed.trat,parsed.dosis,f.dia,invs.join(' ')].join(' ')
  });
 });
 rows.sort((a,b)=>b.day-a.day||a.title.localeCompare(b.title,'es'));
 const n=rows.length;
 const buscar=limpiarBusquedaFitoV3(busquedaFitoV3);
 const salas=[['sala1','Sala 1'],['sala2','Sala 2'],['sala3','Sala 3'],['sala4','Sala 4'],['sala5','Sala 5']];
 const invsPorSala=[['Sala 1',Object.keys(INV_LAYOUT_SALA1)],
  ['Sala 2',Object.keys(INV_LAYOUT_SALA2)],['Sala 3',Object.keys(INV_LAYOUT_SALA3)],
  ['Sala 4',Object.keys(INV_LAYOUT_SALA4)],['Sala 5',Object.keys(INV_LAYOUT_SALA5)]];
 const boxSelect='box-sizing:border-box;min-height:40px;width:100%;padding:7px 9px;border:1px solid #b5c9df;border-radius:8px;background:#fff;color:#263344;font-size:13px';
 const filtDia='<select aria-label="Día" onchange="cambiarResumenQuincenaDiaFiltro(\'fito\',this.value)" style="'+boxSelect+'">'
  +'<option value="">Todos los días</option>'
  +dias.map(d=>'<option value="'+d+'"'+(filtroDia===d?' selected':'')+'>'+esc(riegoDiaLabelCorto(d))+' · '+esc(riegoDiaSemana(d))+'</option>').join('')+'</select>';
 const filtSala='<select aria-label="Sala" onchange="cambiarResumenQuincenaSalaFiltro(\'fito\',this.value)" style="'+boxSelect+'">'
  +'<option value="">Todas las salas</option>'
  +salas.map(([k,v])=>'<option value="'+k+'"'+(filtroSala===k?' selected':'')+'>'+v+'</option>').join('')+'</select>';
 const filtInv='<select aria-label="Invernadero" onchange="cambiarResumenQuincenaInvFiltro(\'fito\',this.value)" style="'+boxSelect+'">'
  +'<option value="">Todos los invernaderos</option>'
  +invsPorSala.map(([s,ids])=>'<optgroup label="'+s+'">'+ids.sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).map(k=>'<option value="'+esc(k)+'"'+(filtroInv===k?' selected':'')+'>INV '+esc(k)+'</option>').join('')+'</optgroup>').join('')+'</select>';
 const cards=rows.map(row=>{
  const dateLabel=esc(riegoDiaLabelCorto(row.day))+' · '+esc(riegoDiaSemana(row.day));
  const linkedRow=row.kind==='linked';
  const note=linkedRow&&row.start&&row.start!==dayISO(row.day)
   ?'Inicio '+esc(row.start.slice(8,10)+'/'+row.start.slice(5,7)):'';
  const attrs=linkedRow?' data-serie="'+esc(row.serieId)+'" data-jornada="'+esc(row.jornadaId)+'"':'';
  const editOnclick=linkedRow
   ?'editarJornadaFitoConsultaV3(this.dataset.serie,this.dataset.jornada)'
   :'editarResumenTratamiento(\'fito\','+row.idx+')';
  const printOnclick=linkedRow
   ?'imprimirJornadaFitoConsultaV3(this.dataset.serie,this.dataset.jornada)'
   :'imprimirHojaResumen(\'fito\','+row.idx+')';
  const buttonStyle='box-sizing:border-box;min-height:44px;height:44px;border:1px solid #1558a0;border-radius:8px;background:#1558a0;color:#fff;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center';
  // Impresión solo si la jornada ya contiene los datos necesarios para el parte.
  const piezas=linkedRow?(row.items||[]):[];
  const faltaCaldo=linkedRow&&piezas.some(x=>!Number.isFinite(Number(x.raw?.caldoLitros))||Number(x.raw.caldoLitros)<=0);
  const faltaDosis=linkedRow&&piezas.some(x=>{
    const p=parsearTextoFito(x.raw?.texto||''),lista=parsearProductosDosis(p.trat||'',p.dosis||'');
    return !lista.length||lista.length>5||lista.some(y=>!y.producto?.trim()||!Number.isFinite(y.dosis)||y.dosis<=0||!y.unidad);
  });
  const faltaMetodo=linkedRow&&row.method!=='Pistola'&&row.method!=='Cañón';
  const printIssue=faltaCaldo?'Falta caldo':faltaDosis?'Falta dosis':faltaMetodo?'Falta método':'';
  const printAction=printIssue
    ?'<span title="Edita la jornada para completar este dato" style="display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#8a5d14;background:#fff8e7;border:1px solid #e9d3a0;border-radius:8px;min-height:44px;padding:0 7px">'+printIssue+'</span>'
    :'<button type="button"'+attrs+' onclick="'+printOnclick+'" title="Imprimir parte del tratamiento" style="'+buttonStyle+';width:100%;padding:0 7px;gap:5px"><i class="ti ti-printer" aria-hidden="true"></i> Imprimir parte</button>';
  const action=row.anulada?'<div style="padding:10px;color:#a32020;background:#fff1f1;border-radius:8px;font-size:12px;font-weight:800">Jornada anulada · histórico conservado</div>':
   '<button type="button"'+attrs+' onclick="'+editOnclick+'" style="'+buttonStyle+';width:100%;min-width:0;padding:0 12px">'
   +(linkedRow?'Editar jornada':'Editar registro')+'</button>'
   +printAction;
  const taskAction=linkedRow&&row.method==='Pistola'&&['ADMIN','TECNICO'].includes(currentUserRole)
   ?'<button type="button"'+attrs+' onclick="consultarTareaJornadaFitoV3(this.dataset.serie,this.dataset.jornada)" style="'+buttonStyle+';background:#fff;color:#1558a0;width:100%;margin-top:7px">Estado de tarea</button>'
   :'';
  const badges=[row.method,row.broth].filter(Boolean).join(' · ');
  const detailsText=[row.dose,row.time,badges].filter(Boolean).map(x=>esc(x)).join(' · ');
  const location=esc(row.location)+(row.count?' · '+row.count+' calles':'');
  const visible=!buscar||limpiarBusquedaFitoV3(row.search).includes(buscar);
  return '<details data-fito-consulta-registro data-busqueda="'+esc(limpiarBusquedaFitoV3(row.search))+'"'
   +(visible?'':' hidden')+' style="box-sizing:border-box;width:100%;border:1px solid #cfdeec;border-radius:10px;background:#fff;overflow:hidden">'
   +'<summary style="cursor:pointer;list-style:none;display:block;padding:11px 13px;min-height:54px;color:#1a2e42">'
   +'<div style="display:grid;grid-template-columns:minmax(0,1fr) 24px;gap:8px;align-items:start">'
   +'<div style="min-width:0">'
   +'<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin-bottom:4px">'
   +'<span style="font-size:12px;font-weight:800;color:#1558a0">'+dateLabel+'</span>'
   +(note?'<span style="font-size:11px;color:#53677d">'+note+'</span>':'')+'</div>'
   +'<div style="font-size:14px;font-weight:800;overflow-wrap:anywhere">'+esc(row.title)+'</div>'
   +(detailsText?'<div style="font-size:12px;color:#455c74;margin-top:4px;overflow-wrap:anywhere">'+detailsText+'</div>':'')
   +'<div style="font-size:12px;color:#455c74;margin-top:4px">'+location+'</div></div>'
   +'<i class="ti ti-chevron-down fito-consulta-toggle" aria-hidden="true" style="justify-self:center;margin-top:2px;font-size:17px;color:#1558a0;transition:transform .18s"></i>'
   +'</div></summary>'
   +'<div style="box-sizing:border-box;width:100%;background:#f6f9fd;border-top:1px solid #dce6f2;padding:10px 12px">'
   +'<div style="display:flex;flex-direction:column;width:100%;gap:7px">'+row.detail+'</div>'
   +'<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(127px,auto);gap:8px;width:100%;margin-top:10px">'+action+'</div>'
   +taskAction+'</div></details>';
 }).join('');
 const shown=rows.filter(row=>!buscar||limpiarBusquedaFitoV3(row.search).includes(buscar)).length;
 return '<div id="resumen-quincena-fito" style="box-sizing:border-box;width:100%;max-width:950px;margin:0 auto">'
  +'<style>#resumen-quincena-fito summary::-webkit-details-marker{display:none}#resumen-quincena-fito details[open] .fito-consulta-toggle{transform:rotate(180deg)}</style>'
  // Mismo paginador que Marcar riego: flechas 36×36, borde y texto fluido.
  +'<div style="box-sizing:border-box;width:100%;padding:.45rem .75rem;background:#e8f0fb;border-bottom:1px solid #b0c8e0;margin-bottom:9px">'
  +'<div style="display:grid;grid-template-columns:36px minmax(0,1fr) 36px;align-items:center;gap:8px;width:100%">'
  +'<button type="button" onclick="changeFitoQuincena(-1)"'+(fitoQuincenaOffset<=0?' disabled':'')
  +' title="Quincena anterior" aria-label="Quincena anterior" style="background:'+(fitoQuincenaOffset<=0?'#d6dbe1':'#1558a0')
  +';border:1px solid '+(fitoQuincenaOffset<=0?'#b8c0ca':'#1558a0')+';color:'+(fitoQuincenaOffset<=0?'#68727d':'#fff')
  +';border-radius:7px;width:36px;height:36px;cursor:'+(fitoQuincenaOffset<=0?'default':'pointer')+';font-size:20px;font-weight:700;line-height:1">&#8249;</button>'
  +'<span style="min-width:0;font-size:clamp(12px,3.3vw,15px);font-weight:800;color:#1558a0;line-height:1.3;text-align:center;white-space:nowrap">'+esc(riegoQuincenaLabel(fitoQuincenaOffset))+'</span>'
  +'<button type="button" onclick="changeFitoQuincena(1)" title="Quincena siguiente" aria-label="Quincena siguiente"'
  +' style="background:#1558a0;border:1px solid #1558a0;color:#fff;border-radius:7px;width:36px;height:36px;cursor:pointer;font-size:20px;font-weight:700;line-height:1">&#8250;</button>'
  +'</div></div>'
  +'<div style="box-sizing:border-box;width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:7px;padding:9px;background:#eaf1fa;border:1px solid #cbdcef;border-radius:9px;margin-bottom:8px">'
  +'<label style="min-width:0;font-size:11px;font-weight:750;color:#1558a0">Día'+filtDia+'</label>'
  +'<label style="min-width:0;font-size:11px;font-weight:750;color:#1558a0">Sala'+filtSala+'</label>'
  +'<label style="min-width:0;font-size:11px;font-weight:750;color:#1558a0">Invernadero'+filtInv+'</label>'
  +'<label style="min-width:0;font-size:11px;font-weight:750;color:#1558a0">Buscar'
  +'<input type="search" value="'+esc(busquedaFitoV3)+'" placeholder="Tratamiento" oninput="filtrarConsultaFitoV3(this.value)" style="'+boxSelect+'"></label>'
  +'</div>'
  +'<div id="fito-consulta-conteo" aria-live="polite" style="font-size:12px;font-weight:750;color:#53677d;margin:0 0 7px">'+shown+' '+(shown===1?'registro':'registros')+'</div>'
  +'<div style="display:flex;flex-direction:column;gap:8px;width:100%">'+cards+'</div>'
  +'<div id="fito-consulta-vacio"'+(shown?' hidden':'')+' style="font-size:13px;text-align:center;padding:24px 8px;color:#53677d">'
  +'No hay tratamientos.</div>'
  +'</div>';
}
window.renderResumenQuincenaTratamientos=construirConsultaFitoV3;
function filtrarConsultaFitoV3(value){
 busquedaFitoV3=value;
 const container=document.getElementById('resumen-quincena-fito');
 if(!container)return;
 const key=limpiarBusquedaFitoV3(value);
 const elements=container.querySelectorAll('[data-fito-consulta-registro]');
 let n=0;
 elements.forEach(e=>{
  const matches=!key||(e.dataset.busqueda||'').includes(key);
  e.hidden=!matches;
  if(matches)n++;
 });
 const count=container.querySelector('#fito-consulta-conteo');
 if(count)count.textContent=n+' '+(n===1?'registro':'registros');
 const empty=container.querySelector('#fito-consulta-vacio');
 if(empty)empty.hidden=n>0;
}
window.filtrarConsultaFitoV3=filtrarConsultaFitoV3;
function editarJornadaFitoConsultaV3(id,journalId){
 const e=seriesCells(id).find(x=>(x.raw.jornadaId||x.raw.fechaJornadaISO||dayISO(x.day))===journalId);
 if(!e){showToast('No se encuentra la jornada. Recarga la consulta.');return;}
 editFullLinkedJournal(e.raw);
}
window.editarJornadaFitoConsultaV3=editarJornadaFitoConsultaV3;
function imprimirJornadaFitoConsultaV3(id,journalId){
 if(fitoDirtyCells.size){showToast('Hay cambios pendientes. Guarda o cancela antes de imprimir.');return;}
 const entries=seriesCells(id).filter(e=>(e.raw.jornadaId||e.raw.fechaJornadaISO||dayISO(e.day))===journalId);
 const pages=buildPrintJobsV3(entries);
 if(!pages.length){showToast('La jornada no tiene una fecha única. Revisa el registro.','warning');return;}
 // El alta permite caldo opcional; una hoja oficial no debe atribuir un gasto
 // calculado a un volumen inexistente. Informar del INV afectado sin escribir.
 const sinCaldo=pages.filter(x=>!Number.isFinite(Number(x.datos.caldoLitros))||Number(x.datos.caldoLitros)<=0);
 if(sinCaldo.length){
  const invs=[...new Set(sinCaldo.flatMap(x=>(x.datos.objetivos||[]).map(o=>String(o.inv))))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  showToast('Falta caldo inicial en INV '+invs.join(', ')+'. Completa la jornada antes de imprimir.','warning');
  return;
 }
 imprimirHojaFitoConDatos(pages.map(x=>({...x.datos,asignadoPor:currentUser})));
}
window.imprimirJornadaFitoConsultaV3=imprimirJornadaFitoConsultaV3;

async function consultarTareaJornadaFitoV3(serieId,jornadaId){
 if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('Consulta reservada a técnicos y administradores.');return;}
 try{
  const result=await window.storage.get(TAREAS_KEY);
  if(!result)throw Error('No se pudo consultar Tareas.');
  const tareas=JSON.parse(result.value);
  if(!Array.isArray(tareas))throw Error('Formato remoto de Tareas inválido.');
  const iguales=tareas.filter(t=>t.origenFito?.serieId===serieId
    &&t.origenFito?.jornadaId===jornadaId);
  if(iguales.length>1)throw Error('Hay duplicados; revisión administrativa obligatoria.');
  if(iguales.length){
   const t=iguales[0];
   if(t.categoria!=='fumigacion')throw Error('La tarea vinculada tiene una categoría incompatible.');
   if(t.conciliacionFito){
    const r=await cRecuperar(serieId,jornadaId);
    showToast(r.estado==='conciliada'?'✓ Jornada y tarea conciliadas.':'✓ Reserva liberada; la jornada anterior se conserva.');
    return;
   }
   const detalle=['Estado: '+t.estado,'Operario: '+t.asignadoA,'Zonas: '+invCallesLabelDeTarea(t),
    t.horaInicio?'Inicio: '+t.horaInicio:'',t.horaFin?'Fin: '+t.horaFin:'',
    t.caldoSobrante?'Caldo sobrante: '+t.caldoSobrante:'',
    t.firmaPreparador?'Preparó: '+t.firmaPreparador:'',
    t.firmaAplicador?'Aplicó: '+t.firmaAplicador:'',
    ...(t.rectificacionesFito||[]).map(r=>'Rectificación '+r.fecha+' ('+r.usuario+'): '+r.accion+' · '+r.motivo)].filter(Boolean).join('\n');
   await confirmarFitoAccionV3({titulo:'Ejecución Pistola',detalle,accion:'Cerrar'});
   return;
  }
  if(!(await confirmarFitoAccionV3({titulo:'Tarea Pistola sin confirmar',
    detalle:'No consta tarea vinculada. Se comprobará la jornada en el servidor antes de asignarla.',
    accion:'Conciliar tarea'})))return;
  if(fitoDirtyCells.size)throw Error('Hay cambios locales sin sincronizar.');
  // v1 es fuente canónica; el espejo v2 puede estar desfasado tras un fallo parcial.
  const remoto=await window.storage.get(FITO_KEY);
  if(!remoto)throw Error('No se pudo verificar Plaguicidas en el servidor.');
  const cloud=JSON.parse(remoto.value);
  if(!cloud||typeof cloud!=='object'||Array.isArray(cloud))
   throw Error('Formato remoto de Plaguicidas inválido.');
  const cells=[];
  Object.entries(cloud).forEach(([inv,days])=>
   Object.entries(days||{}).forEach(([d,streets])=>
    Object.entries(streets||{}).forEach(([street,raw])=>{
     if(raw&&typeof raw==='object'&&raw.serieId===serieId
       &&raw.jornadaId===jornadaId&&raw.texto)
      cells.push({inv,day:Number(d),street:Number(street),raw});
    })));
  if(!cells.length)throw Error('Jornada ausente tras la lectura remota.');
  const day=cells[0].day;
  if(cells.some(x=>x.day!==day||x.raw.tipoTrat!=='Pistola'||x.raw.estadoRegistro==='anulado'))
   throw Error('Jornada no válida para asignar Pistola.');
  const base=cells[0].raw,parsed=parsearTextoFito(base.texto||'');
  if(!parsed.trat||cells.some(x=>{
   const p=parsearTextoFito(x.raw.texto||'');
   return p.trat!==parsed.trat||p.dosis!==parsed.dosis||p.horario!==parsed.horario
    ||x.raw.caldoLitros!==base.caldoLitros||x.raw.caldoLabel!==base.caldoLabel;
  }))throw Error('Diferentes preparaciones en la jornada; revisar manualmente.');
  const invs=[...new Set(cells.map(x=>x.inv))];
  const salas=[...new Set(invs.map(salaDeInv))];
  if(salas.length!==1||!salas[0])throw Error('Jornada distribuida entre salas incompatibles.');
  const titulo=[parsed.trat,parsed.dosis].filter(Boolean).join(' ');
  const peon=peonDelaSala(invs[0]);
  if(tareas.some(t=>t.categoria==='fumigacion'&&!t.origenFito?.serieId
    &&t.fechaISO===dayISO(day)&&t.asignadoA===peon&&t.titulo===titulo))
   throw Error('Existe tarea histórica similar sin vínculo; conciliación manual obligatoria.');
  const objetivos=[];
  for(const inv of invs){
   const calles=[...new Set(cells.filter(x=>x.inv===inv).map(x=>x.street))].sort((a,b)=>a-b);
   agruparCallesEnTramos(calles).forEach(t=>objetivos.push({
    invId:inv,callesLabel:formatRangoConInv(inv,t.desde,t.hasta)
   }));
  }
  const assigned=await autoAsignarTareaFumigacion(objetivos,day,titulo,parsed.horario,{
   producto:parsed.trat,dosis:parsed.dosis,caldoLitros:base.caldoLitros,
   caldoLabel:base.caldoLabel,serieId,jornadaId
  });
  if(!assigned?.ok)throw Error('No se confirmó la asignación de Tareas.');
  showToast(assigned.yaExistia?'✓ Tarea ya existente, no duplicada.':'✓ Tarea Pistola asignada.');
 }catch(e){showToast('Pistola: '+String(e?.message||e),'warning');}
}
window.consultarTareaJornadaFitoV3=consultarTareaJornadaFitoV3;

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

// In-form confirmation for pesticide writes: native confirm() cannot reliably
// wrap greenhouse / street lists on small screens. No data mutation before OK.
function confirmarFitoAccionV3({titulo,detalle,accion='Confirmar',destructivo=false}){
 return new Promise(resolve=>{
  const modal=getOrCreateOverlay('fito-v3-confirmacion');
  if(modal.dataset.enCurso==='1'){resolve(false);return;}
  modal.dataset.enCurso='1';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2600;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
  modal.setAttribute('role','presentation');
  modal.innerHTML='<div role="dialog" aria-modal="true" aria-labelledby="fito-v3-confirmar-titulo" style="width:min(440px,100%);max-width:100%;min-width:0;max-height:85vh;overflow:auto;box-sizing:border-box;border-radius:12px;background:#fff;padding:16px;box-shadow:0 9px 35px rgba(0,0,0,.25)">'
   +'<div id="fito-v3-confirmar-titulo" style="font-size:16px;font-weight:800;color:#1558a0;overflow-wrap:anywhere"></div>'
   +'<div id="fito-v3-confirmar-detalle" style="font-size:13px;line-height:1.55;color:#263344;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;margin:12px 0 18px"></div>'
   +'<div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px">'
   +'<button type="button" id="fito-v3-cancelar" style="padding:10px 14px;min-height:40px;border:1px solid #b5c5d6;background:#fff;color:#1558a0;border-radius:8px;font-weight:700">Cancelar</button>'
   +'<button type="button" id="fito-v3-aceptar" style="padding:10px 14px;min-height:40px;border:0;border-radius:8px;font-weight:800;color:#fff"></button>'
   +'</div></div>';
  modal.querySelector('#fito-v3-confirmar-titulo').textContent=titulo;
  modal.querySelector('#fito-v3-confirmar-detalle').textContent=detalle;
  const yes=modal.querySelector('#fito-v3-aceptar');
  yes.textContent=accion;yes.style.background=destructivo?'#b91c1c':'#1558a0';
  let finished=false;
  const done=ok=>{
   if(finished)return;
   finished=true;
   document.removeEventListener('keydown',keyboard,true);
   modal.style.display='none';
   modal.dataset.enCurso='0';
   modal.onclick=null;
   resolve(ok);
  };
  const keyboard=e=>{if(e.key==='Escape'){e.preventDefault();done(false);}};
  modal.onclick=e=>{if(e.target===modal)done(false);};
  modal.querySelector('#fito-v3-cancelar').addEventListener('click',()=>done(false));
  yes.addEventListener('click',()=>done(true));
  document.addEventListener('keydown',keyboard,true);
  modal.querySelector('#fito-v3-cancelar').focus();
 });
}


// Bloque C TEST: reserva ETag de Tareas y verificación del nodo Fito canónico.
// Las escrituras no son atómicas entre colecciones; la reserva es recuperable.
const cJornada=(data,serieId,jornadaId)=>{
 const rows=[];
 Object.entries(data||{}).forEach(([inv,days])=>
  Object.entries(days||{}).forEach(([day,streets])=>
   Object.entries(streets||{}).forEach(([street,raw])=>{
    if(raw&&typeof raw==='object'&&raw.serieId===serieId&&raw.jornadaId===jornadaId)
     rows.push({inv,day:+day,street:+street,raw});
   })));
 return rows.sort((a,b)=>a.inv.localeCompare(b.inv,'es',{numeric:true})||a.day-b.day||a.street-b.street);
};
const cFirma=rows=>JSON.stringify(rows.map(x=>[x.inv,x.day,x.street,x.raw]));
const cObjetivos=rows=>{
 const map=new Map(),out=[];
 rows.forEach(x=>{if(!map.has(x.inv))map.set(x.inv,[]);map.get(x.inv).push(x.street);});
 map.forEach((streets,inv)=>agruparCallesEnTramos([...new Set(streets)].sort((a,b)=>a-b))
  .forEach(r=>out.push({inv,calles:formatRangoConInv(inv,r.desde,r.hasta)})));
 return out;
};
const cObjetivosIguales=(a,b)=>JSON.stringify((a||[]).map(x=>[x.inv,x.calles]).sort())===
 JSON.stringify((b||[]).map(x=>[x.inv,x.calles]).sort());
async function cLeerClave(clave,defaultValue){
 const res=await appFetch(CLOUD_DB_URL+'/'+encodeURIComponent(clave)+'.json',{cache:'no-store'});
 if(!res.ok)throw Error('Sin acceso a '+clave+' en Firebase.');
 let raw=await res.json();if(typeof raw==='string')raw=JSON.parse(raw);
 return raw==null?defaultValue:raw;
}
function cPlan(targets,day,product,dose,time,liters,caldoLabel){
 const rows=targets.flatMap(x=>x.streets.map(street=>({inv:x.inv,street})));
 const objetivos=[];
 targets.forEach(x=>agruparCallesEnTramos(x.streets).forEach(r=>objetivos.push({
  inv:x.inv,calles:formatRangoConInv(x.inv,r.desde,r.hasta)})));
 return {fechaISO:dayISO(day),titulo:[product,dose].filter(Boolean).join(' '),
  producto:product,dosis:dose,horario:time||'',caldoLitros:liters??null,caldoLabel:caldoLabel||'',objetivos};
}
function cPlanConfirmado(rows,op){
 if(!rows.length||rows.some(x=>x.raw.revisionFitoOp!==op.id||x.raw.tipoTrat!=='Pistola'
    ||x.raw.estadoRegistro==='anulado'||dayISO(x.day)!==op.deseado.fechaISO
    ||(x.raw.caldoLitros??null)!==op.deseado.caldoLitros||x.raw.caldoLabel!==op.deseado.caldoLabel))
  return false;
 const prefix=[op.deseado.producto,op.deseado.dosis,op.deseado.horario].filter(Boolean).join(' ');
 return rows.every(x=>String(x.raw.texto||'').startsWith(prefix))&&
  cObjetivosIguales(cObjetivos(rows),op.deseado.objetivos);
}
async function cBloquear(serieId,jornadaId,tipo,deseado){
 if(!['ADMIN','TECNICO'].includes(currentUserRole))throw Error('Solo técnicos/ADMIN modifican Pistola.');
 const cloud=await cLeerClave(FITO_KEY,{});
 const remote=cJornada(cloud,serieId,jornadaId),local=cJornada(fitoData,serieId,jornadaId);
 if(!remote.length||cFirma(remote)!==cFirma(local))throw Error('La jornada ha cambiado. Recarga Plaguicidas.');
 if(remote.some(x=>x.raw.estadoRegistro==='anulado'||x.raw.tipoTrat!=='Pistola'))
  throw Error('La jornada ya está anulada o tiene un método incompatible.');
 const op={id:'fc_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
  serieId,jornadaId,tipo,deseado,antesFirma:cFirma(remote),usuario:currentUser||'—',
  fecha:new Date().toISOString()};
 const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],list=>{
  if(!Array.isArray(list))throw Error('Tareas inválidas.');
  const linked=list.filter(t=>t.origenFito?.serieId===serieId&&t.origenFito?.jornadaId===jornadaId);
  if(linked.length!==1||linked[0].categoria!=='fumigacion')throw Error('Tarea no vinculada o duplicada. Consulta Estado de tarea.');
  const t=linked[0];
  if(t.conciliacionFito)throw Error('Existe una conciliación pendiente en la tarea.');
  if(t.estado!=='pendiente')return undefined;
  if(t.asignadoA!==peonDelaSala(remote[0].inv))throw Error('Asignación a peón incompatible con sala.');
  return list.map(x=>x.id===t.id?{...x,conciliacionFito:op}:x);
 });
 if(!tx.ok)throw Error('No se confirmó la reserva de la tarea.');
 if(tx.noChange)return {firmada:true};
 tareasData=tx.value;return {op};
}
async function cRectificar(serieId,jornadaId,accion,propuesta){
 if(currentUserRole!=='ADMIN')throw Error('La tarea ya está iniciada o firmada: rectificación reservada a ADMIN.');
 const motivo=window.prompt('Motivo de rectificación administrativa (obligatorio):');
 if(!motivo||!motivo.trim())return false;
 const registro={id:'rect_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
  fecha:new Date().toISOString(),usuario:currentUser,accion,motivo:motivo.trim(),propuesta};
 const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],list=>{
  if(!Array.isArray(list))throw Error('Tareas inválidas.');
  const linked=list.filter(t=>t.origenFito?.serieId===serieId&&t.origenFito?.jornadaId===jornadaId);
  if(linked.length!==1||!['iniciada','completada'].includes(linked[0].estado)
    ||linked[0].conciliacionFito)throw Error('La ejecución ha cambiado. Recarga la consulta.');
  return list.map(t=>t.id===linked[0].id
   ?{...t,rectificacionesFito:[...(t.rectificacionesFito||[]),registro]}:t);
 });
 if(!tx.ok||tx.noChange)throw Error('Rectificación sin confirmar.');
 tareasData=tx.value;
 logHistorial('Rectificación administrativa Pistola '+serieId+'/'+jornadaId);
 showToast('✓ Rectificación registrada sin alterar ejecución ni firmas.');
 return true;
}
async function cRecuperar(serieId,jornadaId){
 const list=await cLeerClave(TAREAS_KEY,[]);
 if(!Array.isArray(list))throw Error('Datos de Tareas inválidos.');
 const linked=list.filter(t=>t.origenFito?.serieId===serieId&&t.origenFito?.jornadaId===jornadaId);
 if(linked.length!==1)throw Error('No existe una tarea única vinculada.');
 const op=linked[0].conciliacionFito;
 if(!op)return {estado:'sin_pendientes',tarea:linked[0]};
 if(!['ADMIN','TECNICO'].includes(currentUserRole))throw Error('Conciliación reservada a técnico/ADMIN.');
 const cloud=await cLeerClave(FITO_KEY,{}),rows=cJornada(cloud,serieId,jornadaId);
 const aplicado=op.tipo==='anulacion'
  ?rows.length>0&&rows.every(x=>x.raw.estadoRegistro==='anulado'&&x.raw.revisionFitoOp===op.id)
  :cPlanConfirmado(rows,op);
 const intacto=cFirma(rows)===op.antesFirma;
 if(!aplicado&&!intacto)throw Error('Jornada distinta del origen y del destino. Bloqueo conservado; requiere revisión ADMIN.');
 // Un guardado canónico v1 puede haberse confirmado aunque fallase su espejo v2.
 // Antes de liberar la tarea, restablecer la convergencia de esos INV.
 if(aplicado){
  const invs=[...new Set(rows.map(x=>x.inv))];
  if(!(await syncFitoV2InvsDesdeCloud(cloud,invs)))
   throw Error('La jornada está guardada; queda pendiente sincronizar sus invernaderos antes de confirmar Tareas.');
 }
 const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],list=>{
  if(!Array.isArray(list))throw Error('Tareas inválidas.');
  const same=list.filter(t=>t.origenFito?.serieId===serieId&&t.origenFito?.jornadaId===jornadaId);
  if(same.length!==1||same[0].conciliacionFito?.id!==op.id||same[0].estado!=='pendiente')
   throw Error('La tarea cambió mientras se conciliaba; no se altera.');
  const t=same[0],{conciliacionFito,...base}=t;
  const campos=aplicado?(op.tipo==='anulacion'
    ?{estado:'anulada',archivadaEn:new Date().toISOString(),anuladaPor:op.usuario,motivoAnulacion:'Jornada Pistola anulada'}
    :{...op.deseado,visto:false}):{};
  return list.map(x=>x.id===t.id?{...base,...campos}:x);
 });
 if(!tx.ok||tx.noChange)throw Error('Actualización de tarea no confirmada.');
 tareasData=tx.value;refreshTareasViews();
 return {estado:aplicado?'conciliada':'revertida',tarea:tx.value.find(t=>t.id===linked[0].id)};
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
  if(!product)throw Error('Selecciona una mezcla o indica el producto fitosanitario.');
  // Los registros nuevos incluyen lo necesario para imprimir un parte completo.
  // Los históricos previos se conservan sin cambios ni migraciones.
  if(!st.edit&&method!=='Pistola'&&method!=='Cañón')
   throw Error('Selecciona el método: Pistola o Cañón.');
  if(!st.edit||method==='Pistola'){
   if(!Number.isFinite(liters)||liters<=0)
    throw Error('Selecciona el volumen de mezcla (caldo) en litros.');
   if(dose&&!/^\s*\d+(?:[.,]\d+)?\s*(?:cc|gr|ml|g)\s*\/\s*l\s*$/i.test(dose))
    throw Error('Dosis incorrecta. Utiliza, por ejemplo, 1 cc/L.');
   const productosDosis=parsearProductosDosis(product,dose);
   if(!productosDosis.length||productosDosis.length>5||
     productosDosis.some(p=>!p.producto?.trim()||!Number.isFinite(p.dosis)||p.dosis<=0||!p.unidad))
    throw Error('Indica la dosis por litro de cada producto (máximo cinco).');
  }
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
  const edicionPistola=!!st.edit&&!st.edit.legacy&&originals.some(x=>x.streets.some(c=>getFitoCellRaw(x.inv,x.day,c)?.tipoTrat==='Pistola'));
  if(st.edit&&(edicionPistola?method!=='Pistola':method==='Pistola'))
   throw Error('No se permite cambiar el método al editar una jornada.');
  if(edicionPistola&&new Set(targets.map(x=>salaDeInv(x.inv))).size!==1)
   throw Error('Una jornada Pistola debe mantenerse en una sola sala.');
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
  if(!(await confirmarFitoAccionV3({
   titulo:st.edit?'Confirmar edición de jornada':'Confirmar registro de jornada',
   detalle:iso+' · '+product+'\n'+places+'\n'+(start?'Inicio global: '+start+'\n':'')+'Registrar no confirma la aplicación física.',
   accion:st.edit?'Guardar cambios':'Registrar jornada'
  })))return;
  let bloqueoPistola=null;
  if(edicionPistola){
   const aprobado=await cBloquear(serieId,jornadaId,'edicion',cPlan(targets,day,product,dose,time,liters,caldoLabel));
   if(aprobado.firmada){
    await cRectificar(serieId,jornadaId,'solicitud de cambio',cPlan(targets,day,product,dose,time,liters,caldoLabel));
    return;
   }
   bloqueoPistola=aprobado.op;
  }
  const text=[dose?product+' '+dose:product,time].filter(Boolean).join(' ');
  const byUndo=new Map();
  for(const x of expect.values()){
   const k=key(x.invId,x.dia,'');
   if(!byUndo.has(k))byUndo.set(k,{invId:x.invId,dia:x.dia,calles:[]});
   byUndo.get(k).calles.push(x.calle);
  }
  registrarUndoFitoMultiInv([...byUndo.values()]);
  for(const x of targets)for(const c of x.streets){
   const note=x.notes.get(c)||'',value=note?text+' — '+note:text,cfg=fmBulkConfig[x.inv]||{};
   const extra={caldoLitros:liters,caldoLabel,tipoTrat:method,primerDia:st.edit?.legacy?!!cfg.primerDia:false,esperaCarga:!!cfg.esperaCarga,orden:cfg.orden??null};
   if(serieId)Object.assign(extra,{serieId,jornadaId,inicioSerieISO:start,fechaJornadaISO:iso,estadoRegistro:'registrado'});
   if(bloqueoPistola)extra.revisionFitoOp=bloqueoPistola.id;
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
  let tareaNoConfirmada=false;
  if(bloqueoPistola){
   try{const resultado=await cRecuperar(serieId,jornadaId);
     tareaNoConfirmada=resultado.estado!=='conciliada';
   }catch(e){tareaNoConfirmada=true;console.warn('Conciliación Pistola pendiente',e);}
  }
  if(method==='Pistola'&&!st.edit){
   try{
    const objectives=[];
    targets.forEach(x=>agruparCallesEnTramos(x.streets).forEach(t=>objectives.push({invId:x.inv,callesLabel:formatRangoConInv(x.inv,t.desde,t.hasta)})));
    const asignada=await autoAsignarTareaFumigacion(objectives,day,[product,dose].filter(Boolean).join(' '),time,{
     producto:product,dosis:dose,caldoLitros:liters,caldoLabel,serieId,jornadaId
    });
    if(!asignada?.ok)tareaNoConfirmada=true;
   }catch(e){tareaNoConfirmada=true;}
  }
  document.getElementById('fito-manual-overlay').style.display='none';
  if(fitoInvSel)renderFitoGrid(fitoInvSel);
  if(tareaNoConfirmada){
   showToast('Jornada guardada; tarea Pistola sin confirmar. Revisar con ADMIN.','warning');
  }else{
   showToast('✓ Jornada '+iso+' registrada · '+total+' calles. Inicio global '+(start||'no vinculado'));
  }
 }catch(e){showToast(String(e?.message||e));}
 finally{st.busy=false;if(btn)btn.disabled=st.uncertain;}
};

window.borrarFitoManual=async function(){
 if(st.busy||st.uncertain)return;
 const context=st.edit;
 if(!context){showToast('Solo se puede borrar una selección editada.');return;}
 st.busy=true;
 try{
  if(fitoDirtyCells.size)throw Error('Hay cambios pendientes de sincronizar. Recarga antes de borrar.');
  const originals=context.records||[];
  if(!originals.length)throw Error('No hay celdas originales identificadas.');
  // Linked records delete an entire daily journal; legacy records delete only the explicitly edited group.
  const records=(!context.legacy)?seriesCells(context.id).filter(x=>x.raw.jornadaId===context.jornadaId)
    .map(x=>({inv:x.inv,day:x.day,street:x.street,raw:x.raw}))
    : originals.flatMap(x=>x.streets.map(c=>({inv:x.inv,day:x.day,street:c,raw:getFitoCellRaw(x.inv,x.day,c)})));
  if(!records.length)throw Error('Registro original vacío. Recarga y vuelve a consultar.');
  const pistola=records.some(x=>x.raw&&typeof x.raw==='object'&&x.raw.tipoTrat==='Pistola');
  if(pistola){
   if(context.legacy)throw Error('La jornada histórica Pistola necesita conciliación administrativa antes de anular.');
   if(records.some(x=>x.raw?.estadoRegistro==='anulado'))
    throw Error('La jornada ya está anulada.');
   const further=seriesCells(context.id).filter(x=>x.raw.jornadaId!==context.jornadaId);
   if(further.length&&records.some(x=>dayISO(x.day)===context.start))
    throw Error('No se puede anular la jornada de inicio si hay jornadas posteriores.');
   if(!(await confirmarFitoAccionV3({
    titulo:'Anular jornada de Pistola',
    detalle:'La jornada dejará de estar activa y su tarea pendiente pasará a Archivo.\nSe conservarán el tratamiento, sus calles y el histórico completo.',
    accion:'Anular jornada',destructivo:true
   })))return;
   const lock=await cBloquear(context.id,context.jornadaId,'anulacion',null);
   if(lock.firmada){
    await cRectificar(context.id,context.jornadaId,'solicitud de anulación',
     {fechaISO:dayISO(records[0].day),calles:records.map(x=>({inv:x.inv,calle:x.street}))});
    return;
   }
   const afectadas=records.map(x=>({invId:x.inv,dia:x.day,calle:x.street,raw:clone(x.raw)}));
   const fecha=new Date().toISOString();
   registrarUndoFitoMultiInv(records.map(x=>({invId:x.inv,dia:x.day,calles:[x.street]})));
   records.forEach(x=>setFito(x.inv,x.day,x.street,x.raw.texto,{
    estadoRegistro:'anulado',anuladaEn:fecha,anuladoPor:currentUser||'—',
    revisionFitoOp:lock.op.id
   }));
   completarUndoFitoParaTodosGrupos();
   const result=await saveFitoPatch([] ,afectadas);
   if(!result.ok){
    st.uncertain=true;
    showToast('Anulación sin confirmar. Consulta Estado de tarea antes de repetir.');
    return;
   }
   let conciliado=false;
   try{conciliado=(await cRecuperar(context.id,context.jornadaId)).estado==='conciliada';}
   catch(e){console.warn('Anulación Pistola pendiente de conciliar',e);}
   document.getElementById('fito-manual-overlay').style.display='none';
   if(fitoInvSel)renderFitoGrid(fitoInvSel);
   showToast(conciliado?'✓ Jornada anulada y tarea archivada.':
    'Jornada anulada; tarea pendiente de conciliación. Consulta Estado de tarea.',conciliado?undefined:'warning');
   return;
  }
  const affected=new Map(),capture=(inv,day,street)=>{
   const k=key(inv,day,street);
   if(!affected.has(k))affected.set(k,{invId:inv,dia:day,calle:street,raw:clone(getFitoCellRaw(inv,day,street))});
  };
  records.forEach(x=>capture(x.inv,x.day,x.street));
  if(!context.legacy){
   const more=seriesCells(context.id),remaining=more.filter(x=>x.raw.jornadaId!==context.jornadaId);
   // Protect the immutable global start: it cannot be deleted while subsequent days remain.
   if(remaining.length && records.some(x=>dayISO(x.day)===context.start))
    throw Error('No se puede borrar la primera jornada mientras haya continuaciones. Requiere revisión del inicio global.');
   more.forEach(x=>capture(x.inv,x.day,x.street));
  }
  if(!(await confirmarFitoAccionV3({
    titulo:'Confirmar borrado de tratamiento',
    detalle:'Se borrarán '+records.length+' calle(s) de '+(context.legacy?'la selección histórica':'la jornada completa')
     +'\nSolo se eliminarán los registros originales; nunca otras aplicaciones.',
    accion:'Borrar jornada',destructivo:true
   })))return;
  const undoGroups=new Map();
  for(const x of affected.values()){
   const k=key(x.invId,x.dia,'');
   if(!undoGroups.has(k))undoGroups.set(k,{invId:x.invId,dia:x.dia,calles:[]});
   undoGroups.get(k).calles.push(x.calle);
  }
  registrarUndoFitoMultiInv([...undoGroups.values()]);
  records.forEach(x=>setFito(x.inv,x.day,x.street,''));
  if(!context.legacy){
   const remain=seriesCells(context.id),first=new Map();
   remain.forEach(x=>{
    const k=x.inv+'|'+x.street,date=x.raw.fechaJornadaISO||dayISO(x.day);
    if(!first.has(k)||date<first.get(k))first.set(k,date);
   });
   remain.forEach(x=>{
    const isFirst=(x.raw.fechaJornadaISO||dayISO(x.day))===first.get(x.inv+'|'+x.street);
    if(x.raw.primerDia!==isFirst){x.raw.primerDia=isFirst;marcarFitoDirtyCell(x.inv,x.day,x.street);}
   });
  }
  completarUndoFitoParaTodosGrupos();
  const removed=[...new Map(records.map(x=>[key(x.inv,x.day,x.street),x])).values()];
  const deletions=removed.map(x=>({invId:x.inv,dia:x.day,calles:[x.street]}));
  const saved=await saveFitoPatch(deletions,[...affected.values()]);
  if(!saved.ok){
   st.uncertain=true;
   showToast('Borrado sin confirmar. No repitas: recarga y verifica los datos.');
   return;
  }
  document.getElementById('fito-manual-overlay').style.display='none';
  if(fitoInvSel)renderFitoGrid(fitoInvSel);
  showToast('✓ '+(context.legacy?'Selección histórica':'Jornada')+' borrada: '+records.length+' calles.');
 }catch(e){showToast(String(e?.message||e));}
 finally{st.busy=false;}
};
})();
