'use strict';
/* Backoffice QC: catálogo de reglas por estadio, independiente del cálculo operativo. */
(function(){
const AUTH_STORE='lasala-firebase-auth-v1';
const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
const ENDPOINT='/api/admin-qc-reglas';
const CATEGORIES=[
  ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]],
  ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]],
  ['sanidad','Sanidad',[['ok','OK'],['enferma','Enferma']]],
  ['flores','Flores',[['si','Sí'],['no','No']]],
  ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]]
];
const BEHAVIORS=[
  ['pendiente','Pendiente de definir'],['informativo','Informativo'],
  ['incidencia','Incidencia'],['critico','Crítico / Invalidante']
];
const byId=id=>document.getElementById(id);
let stage='tunel',rules=null,busy=false,loaded=false,baseline='';
function node(tag,txt,cls){
  const el=document.createElement(tag);
  if(txt!==null&&txt!==undefined)el.textContent=String(txt);
  if(cls)el.className=cls;
  return el;
}
function status(message,type){
  const e=byId('qcr-feedback');
  e.hidden=!message;e.textContent=message||'';e.className='qcr-feedback '+(type||'');
}
function gate(msg){
  byId('gate-title').textContent='Acceso restringido';
  byId('gate-description').textContent=msg;
  byId('gate-link').hidden=false;
  byId('access-gate').hidden=false;
  byId('workspace').hidden=true;
}
async function token(){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(AUTH_STORE)||'null')}catch(e){}
  if(!saved?.user||!saved?.refreshToken)throw new Error('LOGIN_REQUIRED');
  const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),cache:'no-store'
  });
  if(!r.ok)throw new Error('LOGIN_REQUIRED');
  const a=await r.json();
  if(!a.id_token||!a.refresh_token)throw new Error('LOGIN_REQUIRED');
  localStorage.setItem(AUTH_STORE,JSON.stringify({user:saved.user,refreshToken:a.refresh_token}));
  return a.id_token;
}
async function verifyAdmin(jwt){
  const r=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
  if(r.status===401)throw new Error('LOGIN_REQUIRED');
  if(r.status===403)throw new Error('NO_PERMISSION');
  if(!r.ok)throw new Error('AUTH_ERROR');
  const d=await r.json();
  if(!Array.isArray(d.rooms)||!Array.isArray(d.greenhouses))throw new Error('AUTH_ERROR');
  return d.currentUser||'Administrador';
}
function input(group,option,kind){
  return byId('qcr-groups').querySelector('[data-cat="'+group+'"][data-option="'+option+'"][data-kind="'+kind+'"]');
}
function build(){
  const root=byId('qcr-groups');root.replaceChildren();
  for(const [category,name,options] of CATEGORIES){
    const panel=node('section',null,'qcr-category');
    panel.append(node('h3',name));
    const header=node('div',null,'qcr-row qcr-head');
    for(const text of ['Opción','Tratamiento','Tolerancia %'])header.append(node('span',text));
    panel.append(header);
    for(const [option,label] of options){
      const row=node('div',null,'qcr-row');
      row.append(node('span',label));
      const select=node('select');
      select.dataset.cat=category;select.dataset.option=option;select.dataset.kind='behavior';
      select.setAttribute('aria-label',name+' / '+label+' / tratamiento');
      for(const [key,display] of BEHAVIORS){
        const opt=node('option',display);opt.value=key;select.append(opt);
      }
      const tolerance=node('input');tolerance.type='number';tolerance.min='0';
      tolerance.max='100';tolerance.step='0.01';tolerance.inputMode='decimal';
      tolerance.placeholder='—';tolerance.dataset.cat=category;
      tolerance.dataset.option=option;tolerance.dataset.kind='tolerance';
      tolerance.setAttribute('aria-label',name+' / '+label+' / tolerancia (%)');
      select.addEventListener('change',()=>{
        const disabled=select.value==='pendiente';
        tolerance.disabled=disabled;
        if(disabled)tolerance.value='';
      });
      row.append(select,tolerance);panel.append(row);
    }
    root.append(panel);
  }
}
function view(r){
  rules=r;loaded=true;
  byId('qcr-threshold').value=r.umbralAptitudPct===null?'':String(r.umbralAptitudPct);
  for(const [category,unused,options] of CATEGORIES){
    for(const [option] of options){
      const setting=r.criterios?.[category]?.[option];
      if(!setting)throw new Error('INVALID_RULES');
      const behavior=input(category,option,'behavior');
      const tolerance=input(category,option,'tolerance');
      behavior.value=setting.tratamiento;
      tolerance.disabled=setting.tratamiento==='pendiente';
      tolerance.value=setting.toleranciaPct===null?'':String(setting.toleranciaPct);
    }
  }
  byId('qcr-version').textContent=r.version?'Versión '+r.version+' · actualizado por '+(r.updatedBy||'—'):'Sin configuración guardada';
  baseline=JSON.stringify(collect());
}
function percentage(inputElement){
  const s=inputElement.value.trim();
  if(!s)return null;
  if(!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(s))throw new Error('Porcentaje no válido: introduce entre 0 y 100 con un máximo de dos decimales.');
  const n=Number(s);
  if(!Number.isFinite(n)||n<0||n>100)throw new Error('El porcentaje debe estar entre 0 y 100.');
  return n;
}
function collect(){
  const data={umbralAptitudPct:percentage(byId('qcr-threshold')),criterios:{}};
  for(const [category,unused,options] of CATEGORIES){
    data.criterios[category]={};
    for(const [option,label] of options){
      const behavior=input(category,option,'behavior');
      const tolerance=input(category,option,'tolerance');
      if(!BEHAVIORS.some(([id])=>id===behavior.value))throw new Error('Tratamiento no válido.');
      const value=behavior.value==='pendiente'?null:percentage(tolerance);
      data.criterios[category][option]={tratamiento:behavior.value,toleranciaPct:value};
    }
  }
  return data;
}
function dirty(){
  if(!loaded)return false;
  try{return JSON.stringify(collect())!==baseline}catch(e){return true}
}
async function load(nextStage){
  if(busy)return false;
  busy=true;byId('qcr-save').disabled=true;byId('qcr-stage').disabled=true;
  status('Cargando criterios…','');
  try{
    const jwt=await token();
    await verifyAdmin(jwt);
    const response=await fetch(ENDPOINT+'?stage='+nextStage,{
      method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(response.status===403)throw new Error('NO_PERMISSION');
    if(response.status===401)throw new Error('LOGIN_REQUIRED');
    if(!response.ok)throw new Error('LOAD_FAILED');
    const data=await response.json();
    if(!data.ok||data.stage!==nextStage||!data.rules)throw new Error('LOAD_FAILED');
    stage=nextStage;view(data.rules);
    status('','');
    return true;
  }catch(e){
    if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión para continuar.':'Solo administradores.');
    else status('No se ha podido cargar la configuración. Inténtalo de nuevo.','error');
    return false;
  }finally{
    busy=false;byId('qcr-save').disabled=false;byId('qcr-stage').disabled=false;
  }
}
async function save(e){
  e.preventDefault();
  if(busy||!rules||!loaded)return;
  let values;
  try{values=collect()}catch(error){status(error.message,'error');return}
  if(JSON.stringify(values)===baseline){status('No hay cambios pendientes.','');return}
  busy=true;byId('qcr-save').disabled=true;byId('qcr-stage').disabled=true;
  status('Guardando criterios…','');
  try{
    const jwt=await token();
    const response=await fetch(ENDPOINT,{
      method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
      body:JSON.stringify({stage,version:rules.version,...values}),cache:'no-store'
    });
    const result=await response.json().catch(()=>({}));
    if(response.status===409)throw new Error('CONFLICT');
    if(!response.ok||!result.ok||!Number.isInteger(result.version))throw new Error('SAVE_FAILED');
    rules={...rules,...values,version:result.version,
      updatedAt:result.updatedAt,updatedBy:result.updatedBy};
    baseline=JSON.stringify(values);
    byId('qcr-version').textContent='Versión '+rules.version+' · actualizado por '+rules.updatedBy;
    status('Configuración guardada. No se aplica todavía a la calificación de partidas.','success');
  }catch(err){
    status(err.message==='CONFLICT'?
      'Otro administrador ha modificado estos criterios. No se han sobrescrito sus cambios. Vuelve a cargar la página para revisarlos.':
      'No se ha podido confirmar el guardado. Comprueba la versión actual antes de volver a intentarlo.','error');
  }finally{busy=false;byId('qcr-save').disabled=false;byId('qcr-stage').disabled=false}
}
async function start(){
  build();
  byId('qcr-form').addEventListener('submit',save);
  byId('qcr-stage').addEventListener('change',async()=>{
    const next=byId('qcr-stage').value;
    if(next===stage)return;
    if(dirty()&&!confirm('Hay cambios sin guardar en este estadio. ¿Descartarlos?')){
      byId('qcr-stage').value=stage;return;
    }
    if(!(await load(next)))byId('qcr-stage').value=stage;
  });
  window.addEventListener('beforeunload',e=>{
    if(dirty()){e.preventDefault();e.returnValue='';}
  });
  try{
    byId('session-user').textContent=await verifyAdmin(await token());
    byId('workspace').hidden=false;byId('access-gate').hidden=true;
    await load(stage);
  }catch(e){
    gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión para continuar.':
      e.message==='NO_PERMISSION'?'Solo administradores.':'No se ha podido comprobar el acceso.');
  }
}
start();
})();
