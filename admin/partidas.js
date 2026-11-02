'use strict';
// Backoffice Partidas: solo lectura de referencias QC, sin escrituras ni stock inferido.
(function(){
  const AUTH='lasala-firebase-auth-v1';
  const KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const URL_API='/api/admin-partidas',START='2026-06-15';
  const el=id=>document.getElementById(id);
  let busy=false;
  const dateLabel=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES');
  const fmt=n=>Number(n).toLocaleString('es-ES');
  function node(tag,text,cls){
    const x=document.createElement(tag);
    if(text!==undefined&&text!==null)x.textContent=String(text);
    if(cls)x.className=cls;
    return x;
  }
  function message(value,isError){
    const x=el('bp-feedback');x.hidden=!value;x.textContent=value||'';
    x.className='bp-feedback'+(isError?' error':'');
  }
  function gate(text){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=text;
    el('gate-link').hidden=false;el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let state=null;
    try{state=JSON.parse(localStorage.getItem(AUTH)||'null');}catch(_){}
    if(!state?.user||!state?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const data=await r.json();
    if(!data.id_token||!data.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:state.user,refreshToken:data.refresh_token}));
    return data.id_token;
  }
  function defaultDates(){
    const now=new Date(),from=new Date(now);from.setDate(from.getDate()-29);
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    el('bp-from').value=iso(from)<START?START:iso(from);
    el('bp-to').value=iso(now);
  }
  function filters(){
    const from=el('bp-from').value,to=el('bp-to').value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
      throw new Error('Introduce ambas fechas.');
    const diff=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
    if(from<START||diff<0||diff>90)throw new Error('Selecciona un período válido de hasta 91 días desde el 15/06/2026.');
    const tipo=el('bp-type').value,partida=el('bp-search').value.trim();
    if(!['todos','tunel','carga'].includes(tipo)||!/^[A-Za-z0-9._-]{0,40}$/.test(partida))
      throw new Error('Filtra por un número de partida válido.');
    return {from,to,tipo,partida};
  }
  function cell(row,text,isHeader=false){
    row.append(node(isHeader?'th':'td',text));
  }
  function metric(root,value,label){
    const div=node('div',null,'bp-stat');
    div.append(node('strong',fmt(value)),node('span',label));
    root.append(div);
  }
  function render(result){
    if(result.ok!==true||result.source!=='qc-registros'||result.stock!==false||
       !result.totals||!Array.isArray(result.partidas))
      throw new Error('INVALID_RESPONSE');
    const stats=el('bp-stats');stats.replaceChildren();
    metric(stats,result.totals.partidas,'Partidas distintas en el período');
    metric(stats,result.totals.registros,'Registros QC vinculados');
    metric(stats,result.totals.sinPartida,'Registros sin referencia válida');
    const more=result.totals.partidas>result.totals.mostrar;
    el('bp-count').textContent='Mostrando '+fmt(result.totals.mostrar)+' de '+fmt(result.totals.partidas)+
      ' partidas.'+(more?' Acota la búsqueda para ver más resultados.':'')+
      ' Túnel/Carga son controles registrados, no movimientos físicos confirmados.';
    const target=el('bp-parties');target.replaceChildren();
    if(!result.partidas.length){
      target.append(node('p','No hay partidas para los filtros seleccionados.','bp-empty'));
    }
    for(const p of result.partidas){
      const box=node('details',null,'bp-party'),head=node('summary');
      head.append(node('strong','Partida '+p.partida),
        node('span',fmt(p.tunel)+' Túnel · '+fmt(p.carga)+' Carga'));
      box.append(head);
      const scroll=node('div',null,'bp-scroll'),table=node('table',null,'bp-table');
      const thead=node('thead'),headers=node('tr');
      for(const h of ['Fecha','Control','Cliente y variedad (registro)','Ubicación declarada','ID de control'])cell(headers,h,true);
      thead.append(headers);table.append(thead);
      const tbody=node('tbody');
      for(const rec of p.registros){
        const row=node('tr');
        for(const v of [dateLabel(rec.fecha),rec.tipo==='tunel'?'QC Túnel':'QC Carga',
          rec.clienteVariedad||'—',rec.ubicacion||'—',rec.id])cell(row,v);
        tbody.append(row);
      }
      table.append(tbody);scroll.append(table);box.append(scroll);target.append(box);
    }
    el('bp-results').hidden=false;
  }
  async function query(event){
    if(event)event.preventDefault();
    if(busy)return;
    let selected;
    try{selected=filters();}catch(e){message(e.message,true);return}
    busy=true;el('bp-query').disabled=true;el('bp-results').hidden=true;
    message('Consultando registros de Túnel y Carga…',false);
    try{
      const jwt=await token();
      const qs=new URLSearchParams(selected);
      const r=await fetch(URL_API+'?'+qs.toString(),{
        headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(r.status===401)throw new Error('LOGIN_REQUIRED');
      if(r.status===403)throw new Error('NO_PERMISSION');
      if(r.status===400)throw new Error('INVALID_FILTER');
      if(!r.ok)throw new Error('UNAVAILABLE');
      render(await r.json());message('',false);
    }catch(e){
      if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
        gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
      else message(e.message==='INVALID_FILTER'?'Revisa el rango de fechas y el número de partida.':
        'No se pudieron consultar las partidas. No se ha modificado ningún registro.',true);
    }finally{busy=false;el('bp-query').disabled=false;}
  }
  async function boot(){
    defaultDates();
    el('bp-form').addEventListener('submit',query);
    try{
      const jwt=await token();
      const r=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
      if(r.status===401)throw new Error('LOGIN_REQUIRED');
      if(r.status===403)throw new Error('NO_PERMISSION');
      if(!r.ok)throw new Error('UNAVAILABLE');
      const data=await r.json();
      if(!Array.isArray(data.rooms)||!Array.isArray(data.greenhouses))throw new Error('UNAVAILABLE');
      el('session-user').textContent=data.currentUser||'Administrador';
      el('access-gate').hidden=true;el('workspace').hidden=false;
      await query();
    }catch(e){
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
        e.message==='NO_PERMISSION'?'Solo administradores activos.':
        'No se ha podido comprobar el acceso.');
    }
  }
  boot();
})();
