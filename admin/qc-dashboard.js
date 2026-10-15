'use strict';
// Dashboard QC de solo lectura; consultas únicamente a petición del usuario o al abrir.
(function(){
  const AUTH_STORE='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const FICHA_CONTEXT='lasala-qc-prototipo-ref-v1';
  const ENDPOINT='/api/admin-qc-dashboard';
  const START='2026-06-15';
  const TREATMENTS={
    pendiente:'Sin definir',informativo:'Informativo',
    incidencia:'Incidencia',critico:'Crítico'
  };
  const CAT_ORDER=['color','tamano','sanidad','flores','raices'];
  const el=id=>document.getElementById(id);
  let busy=false;
  const formatInt=n=>Number(n).toLocaleString('es-ES');
  const formatPct=n=>typeof n==='number'&&Number.isFinite(n)?
    n.toLocaleString('es-ES',{maximumFractionDigits:2})+' %':'—';
  const readableDate=iso=>new Date(iso+'T12:00:00')
    .toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
  const stageName=type=>type==='tunel'?'Túnel':'Carga';
  function node(tag,text,cls){
    const x=document.createElement(tag);
    if(text!==null&&text!==undefined)x.textContent=String(text);
    if(cls)x.className=cls;
    return x;
  }
  function message(msg,error){
    const box=el('qcd-feedback');box.hidden=!msg;box.textContent=msg||'';
    box.className='qcd-feedback'+(error?' error':'');
  }
  function gate(msg){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=msg;
    el('gate-link').hidden=false;el('workspace').hidden=true;
    el('access-gate').hidden=false;
  }
  async function getToken(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH_STORE)||'null')}catch(e){}
    if(!saved?.user||!saved?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const auth=await r.json();
    if(!auth.id_token||!auth.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_STORE,JSON.stringify({
      user:saved.user,refreshToken:auth.refresh_token
    }));
    el('session-user').textContent=saved.user;
    return auth.id_token;
  }
  function defaultDates(){
    const now=new Date(),prev=new Date(now);
    prev.setDate(now.getDate()-29);
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    el('qcd-to').value=iso(now);
    el('qcd-from').value=iso(prev)<START?START:iso(prev);
  }
  function selectedFilters(){
    const from=el('qcd-from').value,to=el('qcd-to').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from<START||to<from)
      throw new Error('Selecciona un intervalo de fechas válido.');
    const ms=Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
    if(!Number.isFinite(ms)||ms>90)throw new Error('El periodo máximo por consulta es de 91 días.');
    const tipo=el('qcd-type').value;
    if(!['todos','tunel','carga'].includes(tipo))throw new Error('Estadio incorrecto.');
    const partida=el('qcd-partida').value.trim();
    if(!/^[\w.-]{0,40}$/.test(partida))throw new Error('Filtra por un número de partida válido.');
    return {from,to,tipo,partida};
  }
  function metric(root,n,label){
    const card=node('div',null,'qcd-metric');
    card.append(node('b',n),node('span',label));
    root.append(card);
  }
  function cell(tr,txt,cls){
    tr.append(node('td',txt,cls));
  }
  function emptyRow(root,cols,text){
    const tr=node('tr'),td=node('td',text,'qcd-muted');td.colSpan=cols;
    td.style.textAlign='left';tr.append(td);root.append(tr);
  }
  function renderStats(data){
    const s=data.stats,root=el('qcd-stats');
    root.replaceChildren();
    metric(root,formatInt(s.records),'Controles cuantificados');
    metric(root,formatInt(s.partidas),'Partidas distintas');
    metric(root,formatInt(s.inspectedAcrossRecords),'Bandejas inspeccionadas en controles*');
    metric(root,formatInt(s.flaggedCount),'Controles con alguna alerta');
    metric(root,s.hasConfiguredRules?formatInt(s.warningCount):'—','Advertencias');
    metric(root,s.hasConfiguredRules?formatInt(s.criticalCount):'—','Alertas prioritarias');
    const note=el('qcd-results').querySelector('.qcd-desc');
    if(data.stats.pendingRecordCount&&note){
      const p=node('p',formatInt(data.stats.pendingRecordCount)+
        ' controles tienen al menos una opción marcada sin tratamiento definido.',
        'qcd-desc');
      root.after(p);
      // Avoid accumulating notes on repeat queries.
      if(root.parentElement){
        root.parentElement.querySelectorAll('.qcd-pending-info').forEach(x=>x.remove());
      }
      p.classList.add('qcd-pending-info');
    }else if(root.parentElement){
      root.parentElement.querySelectorAll('.qcd-pending-info').forEach(x=>x.remove());
    }
  }
  function renderStages(data){
    const root=el('qcd-stages');root.replaceChildren();
    let shown=0;
    for(const type of ['tunel','carga']){
      if(data.filterType!=='todos'&&data.filterType!==type)continue;
      const v=data.partitions?.[type];
      if(!v)continue;
      const row=node('tr');
      for(const val of [stageName(type),formatInt(v.records),formatInt(v.bandejas),
        data.stats.hasConfiguredRules?formatInt(v.warnings):'—',
        data.stats.hasConfiguredRules?formatInt(v.critical):'—'])cell(row,val);
      root.append(row);shown++;
    }
    if(!shown)emptyRow(root,5,'Sin estadios para mostrar.');
  }
  function renderTrend(data){
    const root=el('qcd-trend');root.replaceChildren();
    if(!data.trend.length){
      root.append(node('p','No hay controles cuantificados en este periodo.','qcd-desc'));
      return;
    }
    for(const w of data.trend){
      const wrap=node('div',null,'qcd-barline');
      const label=node('span',readableDate(w.weekStart));
      const track=node('div',null,'qcd-track'),bar=node('div',null,'qcd-fill flagged');
      const share=w.records?Math.min(100,100*w.flagged/w.records):0;
      bar.style.width=share+'%';
      bar.title=w.flagged+' de '+w.records+' controles con alguna alerta';
      track.append(bar);
      const caption=node('span',w.flagged+' / '+w.records+
        ' · '+(w.records?Math.round(100*w.flagged/w.records):0)+' %');
      wrap.append(label,track,caption);root.append(wrap);
    }
  }
  function renderOptions(data){
    const root=el('qcd-options');root.replaceChildren();
    const rows=(data.options||[]).filter(x=>x.recordCount>0)
      .sort((a,b)=>a.type.localeCompare(b.type)||CAT_ORDER.indexOf(a.category)-CAT_ORDER.indexOf(b.category)||
        b.affected-a.affected);
    if(!rows.length){emptyRow(root,7,'Sin características cuantificadas.');return}
    for(const x of rows){
      const tr=node('tr');
      for(const text of [
        stageName(x.type),x.categoryLabel+' · '+x.label,
        formatInt(x.affected)+' / '+formatInt(x.inspected),
        formatPct(x.percent),TREATMENTS[x.treatment]||'Sin definir',
        x.tolerance===null?'—':formatPct(x.tolerance)
      ])cell(tr,text);
      const alerts=x.warningRecords+x.criticalRecords;
      cell(tr,alerts?formatInt(x.warningRecords)+' advert. · '+formatInt(x.criticalRecords)+' prior.':'—',
        x.criticalRecords?'qcd-mark critical':x.warningRecords?'qcd-mark warning':'qcd-muted');
      root.append(tr);
    }
  }
  function openFicha(row){
    if(!row||!['tunel','carga'].includes(row.tipo)||!
      Number.isInteger(row.dia)||typeof row.id!=='string'||!
      /^[A-Za-z0-9_-]{1,180}$/.test(row.id))return;
    sessionStorage.setItem(FICHA_CONTEXT,JSON.stringify({
      tipo:row.tipo,dia:row.dia,id:row.id,ts:Date.now()
    }));
    location.assign('./qc-ficha.html');
  }
  function renderRecords(data){
    const root=el('qcd-records');root.replaceChildren();
    el('qcd-count').textContent=formatInt(data.totalRows)+
      ' inspecciones cuantificadas en el filtro · mostrando '+formatInt(data.shownRows)+
      ' (máximo 150 por consulta). El mismo nº de partida puede aparecer varias veces.';
    if(!data.records.length){emptyRow(root,7,'No hay inspecciones cuantificadas en este periodo.');return;}
    for(const row of data.records){
      const tr=node('tr');
      for(const value of [
        readableDate(row.date),stageName(row.tipo),row.partida,
        formatInt(row.bandejasInspeccionadas),String(row.warningCount),String(row.criticalCount)
      ])cell(tr,value);
      const td=node('td');
      const button=node('button','Abrir QC','qcd-rowbutton');button.type='button';
      button.addEventListener('click',()=>openFicha(row));
      td.append(button);tr.append(td);root.append(tr);
    }
  }
  function render(data){
    if(!data.ok||data.scope!=='quantified-only'||!data.stats||
      !Array.isArray(data.trend)||!Array.isArray(data.options)||!Array.isArray(data.records))
      throw new Error('INVALID_RESPONSE');
    renderStats(data);renderStages(data);renderTrend(data);
    renderOptions(data);renderRecords(data);
    el('qcd-results').hidden=false;
    if(data.invalidExcluded>0)message('Se han omitido '+formatInt(data.invalidExcluded)+
      ' documentos con estructura no válida; no se han incluido en ningún total.',true);
    else if(data.stats.records===0)message('No hay inspecciones con cantidades guardadas para estos filtros.',false);
    else if(!data.stats.hasConfiguredRules)message('Hay mediciones cuantificadas, pero las reglas no tienen tratamientos configurados. Se muestran los porcentajes sin alertas.',false);
    else message('',false);
  }
  async function query(e){
    if(e)e.preventDefault();
    if(busy)return;
    let opts;
    try{opts=selectedFilters()}catch(error){message(error.message,true);return;}
    busy=true;el('qcd-query').disabled=true;
    el('qcd-results').hidden=true;
    message('Consultando indicadores de calidad…',false);
    try{
      const jwt=await getToken();
      const q=new URLSearchParams(opts);
      const response=await fetch(ENDPOINT+'?'+q.toString(),{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(response.status===401||response.status===403)
        throw new Error(response.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
      if(response.status===400)throw new Error('INVALID_FILTER');
      if(!response.ok)throw new Error('UNAVAILABLE');
      render(await response.json());
    }catch(error){
      if(error.message==='LOGIN_REQUIRED'||error.message==='NO_PERMISSION'){
        gate(error.message==='LOGIN_REQUIRED'?'Inicia sesión para continuar.':'Acceso solo para administradores.');
      }else{
        message(error.message==='INVALID_FILTER'?'Comprueba las fechas y filtros de la consulta.':
          error.message==='INVALID_RESPONSE'?'El servidor ha devuelto un resumen incompleto.':
          'No ha sido posible consultar los indicadores. No se han modificado datos.',true);
      }
    }finally{busy=false;el('qcd-query').disabled=false;}
  }
  async function start(){
    defaultDates();
    el('qcd-form').addEventListener('submit',query);
    try{
      const jwt=await getToken();
      const check=await fetch('/api/admin-catalog',{
        headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(check.status===401)throw new Error('LOGIN_REQUIRED');
      if(check.status===403)throw new Error('NO_PERMISSION');
      if(!check.ok)throw new Error('UNAVAILABLE');
      const result=await check.json();
      if(!Array.isArray(result.rooms)||!Array.isArray(result.greenhouses))
        throw new Error('UNAVAILABLE');
      el('session-user').textContent=result.currentUser||'Administrador';
      el('workspace').hidden=false;el('access-gate').hidden=true;
      await query();
    }catch(e){
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión para continuar.':
        e.message==='NO_PERMISSION'?'Acceso solo para administradores.':
        'No se ha podido verificar el acceso a la aplicación.');
    }
  }
  start();
})();
