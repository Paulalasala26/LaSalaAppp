'use strict';
// Backoffice: consulta de registros Fito v2 por un invernadero, sin escritura.
(function(){
const AUTH='lasala-firebase-auth-v1';
const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
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
  const x=el('es-feedback');x.hidden=!text;x.textContent=text||'';
  x.className='es-feedback'+(isError?' error':'');
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
  el('es-to').value=iso(today);
  el('es-from').value=iso(past)<START?START:iso(past);
}
function filters(){
  const inv=el('es-inv').value,from=el('es-from').value,to=el('es-to').value;
  const buscar=el('es-search').value.trim();
  if(!/^[A-Za-z0-9-]{1,16}$/.test(inv))throw Error('Selecciona un invernadero.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw Error('Indica las fechas de inicio y fin.');
  const duration=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
  if(from<START||duration<0||duration>365)throw Error('El período debe estar entre 1 y 366 días desde 15/06/2026.');
  if(buscar.length>80)throw Error('Limita la búsqueda a 80 caracteres.');
  return {inv,from,to,buscar,modo:'especificos'};
}
function fillGreenhouses(catalog){
  const root=el('es-inv');root.replaceChildren();
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
  if(data.ok!==true||data.source!=='especificos-v2'||data.readonly!==true||
    data.ejecucionConfirmada!==false||!data.totals||!Array.isArray(data.rows))
    throw Error('INVALID_RESPONSE');
  const summary=el('es-metrics');summary.replaceChildren();
  for(const [val,label] of [[data.totals.celdas,'Celdas guardadas'],
    [data.totals.vinculadas,'Celdas con vínculos de partida'],
    [data.totals.invalidas,'Celdas no legibles']]){
    const card=make('div',null,'es-metric');
    card.append(make('strong',number(val)),make('span',label));summary.append(card);
  }
  const more=data.totals.celdas>data.totals.mostradas;
  el('es-count').textContent='INV '+data.inv+' · '+data.from+' — '+data.to+
    ' · Mostrando '+number(data.totals.mostradas)+' de '+number(data.totals.celdas)+' celdas.'+
    (more?' Acota fechas o búsqueda para consultar las restantes.':'')+
    ' Un vínculo a varias partidas no significa varias celdas ni aplicación ejecutada.';
  const body=el('es-body');body.replaceChildren();
  if(!data.rows.length){
    const row=make('tr'),col=make('td','No hay específicos registrados para estos filtros.','es-empty');
    col.colSpan=7;row.append(col);body.append(row);
  }
  for(const item of data.rows){
    const row=make('tr');
    const date=new Date(item.fecha+'T12:00:00').toLocaleDateString('es-ES');
    const litres=item.caldoLitros==null?'—':String(item.caldoLitros)+(item.caldoLabel?' · '+item.caldoLabel:'');
    td(row,date,'es-nowrap');
    td(row,item.calle,'es-nowrap');
    td(row,item.texto,'es-product');
    td(row,litres,'es-wrap');
    td(row,item.vinculadaPartidas?'Vinculado a partidas':'Registro general','es-wrap');
    td(row,item.partidas&&item.partidas.length?item.partidas.join(', '):'—','es-wrap');
    td(row,item.numeroVinculos||0,'es-nowrap');
    body.append(row);
  }
  el('es-results').hidden=false;
}
async function query(ev){
  if(ev)ev.preventDefault();
  if(busy)return;
  let opts;
  try{opts=filters()}catch(e){status(e.message,true);return}
  busy=true;el('es-query').disabled=true;el('es-results').hidden=true;
  status('Consultando específicos registrados…');
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
      'No se han podido leer los específicos. No se ha modificado ningún dato.',true);
  }finally{busy=false;el('es-query').disabled=false}
}
async function start(){
  defaultDates();
  el('es-form').addEventListener('submit',query);
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
