'use strict';
// Backoffice: consulta de registros Fito v2 por un invernadero, sin escritura.
(function(){
const AUTH='lasala-firebase-auth-v1';
const API_KEY='AIzaSyBsRjw4NuCFg69P7_eqoX037rgjkbadcA0';
const API='/api/admin-qc-dashboard';
const START='2026-06-15';
const el=id=>document.getElementById(id);
let busy=false;
const number=n=>Number(n).toLocaleString('es-ES');
function make(tag,text,cls){
  const n=document.createElement(tag);
  if(text!==null&&text!==undefined)n.textContent=String(text);
  if(cls)n.className=cls;
  return n;
}
function status(text,isError=false){
  const x=el('pg-feedback');x.hidden=!text;x.textContent=text||'';
  x.className='pg-feedback'+(isError?' error':'');
}
function gate(message){
  el('gate-title').textContent='Acceso restringido';
  el('gate-description').textContent=message;
  el('gate-link').hidden=false;
  el('access-gate').hidden=false;el('workspace').hidden=true;
}
async function token(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(_){saved=null}
  if(!saved?.user||!saved?.refreshToken)throw new Error('LOGIN_REQUIRED');
  const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
    cache:'no-store'
  });
  if(!r.ok)throw new Error('LOGIN_REQUIRED');
  const body=await r.json();
  if(!body.id_token||!body.refresh_token)throw new Error('LOGIN_REQUIRED');
  localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:body.refresh_token}));
  return body.id_token;
}
function defaultDates(){
  const today=new Date(),past=new Date(today);past.setDate(past.getDate()-29);
  const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  el('pg-to').value=iso(today);
  el('pg-from').value=iso(past)<START?START:iso(past);
}
function filters(){
  const inv=el('pg-inv').value,from=el('pg-from').value,to=el('pg-to').value;
  const buscar=el('pg-search').value.trim();
  if(!/^[A-Za-z0-9-]{1,16}$/.test(inv))throw Error('Selecciona un invernadero.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw Error('Indica las fechas de inicio y fin.');
  const duration=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
  if(from<START||duration<0||duration>365)throw Error('El período debe estar entre 1 y 366 días desde 15/06/2026.');
  if(buscar.length>80)throw Error('Limita la búsqueda a 80 caracteres.');
  return {inv,from,to,buscar,modo:'plaguicidas'};
}
function fillGreenhouses(catalog){
  const root=el('pg-inv');root.replaceChildren();
  const empty=make('option','Selecciona un invernadero…');empty.value='';root.append(empty);
  const rooms=new Map((catalog.rooms||[]).map(r=>[r.id,r.label]));
  const items=(catalog.greenhouses||[]).filter(g=>/^[A-Za-z0-9-]{1,16}$/.test(g.id))
    .sort((a,b)=>String(a.roomId).localeCompare(String(b.roomId),'es',{numeric:true})||
      a.id.localeCompare(b.id,'es',{numeric:true}));
  for(const g of items){
    const name=rooms.get(g.roomId)||g.roomId||'Sala sin definir';
    const option=make('option',(g.label||'INV '+g.id)+' · '+name+(g.active?'':' · inactivo'));
    option.value=g.id;root.append(option);
  }
}
function td(row,value,cls){
  const x=make('td',value==null||value===''?'—':value,cls);
  row.append(x);
}
function render(data){
  if(data.ok!==true||data.source!=='fito-v2'||data.readonly!==true||
    data.ejecucionConfirmada!==false||!data.totals||!Array.isArray(data.rows))throw Error('INVALID_RESPONSE');
  const summary=el('pg-metrics');summary.replaceChildren();
  for(const [val,label] of [[data.totals.celdas,'Celdas registradas (no jornadas)'],
    [data.totals.mostradas,'Celdas mostradas'],[data.totals.invalidas,'Celdas no legibles']]){
    const card=make('div',null,'pg-metric');
    card.append(make('strong',number(val)),make('span',label));summary.append(card);
  }
  const more=data.totals.celdas>data.totals.mostradas;
  el('pg-count').textContent='INV '+data.inv+' · '+data.from+' — '+data.to+
    (more?' · Resultados limitados. Acota fechas o búsqueda para consultar los restantes.':'')+
    ' · Los datos muestran registros, no su ejecución.';
  const body=el('pg-body');body.replaceChildren();
  if(!data.rows.length){
    const row=make('tr'),col=make('td','No hay tratamientos registrados en este período.','pg-empty');
    col.colSpan=7;row.append(col);body.append(row);
  }
  for(const item of data.rows){
    const row=make('tr');
    const date=new Date(item.fecha+'T12:00:00').toLocaleDateString('es-ES');
    const litres=item.caldoLitros==null?'—':String(item.caldoLitros)+(item.caldoLabel?' · '+item.caldoLabel:'');
    const codes=[item.serieId?'Serie '+item.serieId:'',item.jornadaId?'Jornada '+item.jornadaId:''].filter(Boolean).join(' · ');
    td(row,date,'pg-nowrap');
    td(row,item.calle,'pg-nowrap');
    td(row,item.texto,'pg-product');
    td(row,item.tipoTrat,'pg-nowrap');
    td(row,litres,'pg-wrap');
    td(row,codes,'pg-wrap');
    td(row,item.estadoRegistro||'—','pg-wrap');
    body.append(row);
  }
  el('pg-results').hidden=false;
}
async function query(ev){
  if(ev)ev.preventDefault();
  if(busy)return;
  let opts;
  try{opts=filters()}catch(e){status(e.message,true);return}
  busy=true;el('pg-query').disabled=true;el('pg-results').hidden=true;
  status('Consultando tratamientos registrados…');
  try{
    const jwt=await token();
    const r=await fetch(API+'?'+new URLSearchParams(opts).toString(),{
      headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
    if(r.status===400)throw Error('INVALID_FILTER');
    if(!r.ok)throw Error('UNAVAILABLE');
    render(await r.json());status('');
  }catch(e){
    if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
    else status(e.message==='INVALID_FILTER'?'Comprueba las fechas, el invernadero y la búsqueda.':
      'No se han podido leer los registros. No se ha modificado ningún dato.',true);
  }finally{busy=false;el('pg-query').disabled=false}
}
async function start(){
  defaultDates();
  el('pg-form').addEventListener('submit',query);
  try{
    const jwt=await token();
    const r=await fetch('/api/admin-catalog',{
      headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
    if(!r.ok)throw Error('UNAVAILABLE');
    const catalog=await r.json();
    if(!Array.isArray(catalog.rooms)||!Array.isArray(catalog.greenhouses))throw Error('UNAVAILABLE');
    fillGreenhouses(catalog);
    el('session-user').textContent=catalog.currentUser||'Administrador';
    el('access-gate').hidden=true;el('workspace').hidden=false;
  }catch(e){
    gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
      e.message==='NO_PERMISSION'?'Solo administradores activos.':
      'No se ha podido verificar el acceso al Backoffice.');
  }
}
start();
})();
