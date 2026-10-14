'use strict';
// Registro de riegos de TEST: sólo lectura. Editar e imprimir derivan al módulo operativo.
(function(){
  const SESSION='lasala-firebase-auth-v1';
  const KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const TEST='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
  const HANDOFF='lasala-backoffice-riego-v1';
  const BACKOFFICE_FILTERS='lasala-backoffice-riego-lista-v1';
  const ANCHOR=Date.UTC(2026,5,15);
  const el=id=>document.getElementById(id);
  let houses=[],items=[],result=[],selectedInv='',busy=false,shown=0;
  const make=(tag,value,cls)=>{
    const e=document.createElement(tag);if(value!=null)e.textContent=String(value);
    if(cls)e.className=cls;return e;
  };
  function feedback(msg,isError=false){
    const box=el('reg-feedback');
    box.textContent=msg||'';box.hidden=!msg;box.className='operation-feedback '+(isError?'error':'ok');
  }
  function gate(title,description){
    el('gate-title').textContent=title;el('gate-description').textContent=description;
    el('gate-link').hidden=false;el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let stored;
    try{stored=JSON.parse(localStorage.getItem(SESSION)||'null');}catch(_){}
    if(!stored?.user||!stored?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:stored.refreshToken}).toString(),cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const next=await r.json();
    if(!next.id_token||!next.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(SESSION,JSON.stringify({user:stored.user,refreshToken:next.refresh_token}));
    return next.id_token;
  }
  async function adminData(jwt){
    const r=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
    if(r.status===401)throw new Error('LOGIN_REQUIRED');
    if(r.status===403)throw new Error('NO_PERMISSION');
    if(!r.ok)throw new Error('SERVICE_UNAVAILABLE');
    const data=await r.json();
    if(!Array.isArray(data.greenhouses)||!Array.isArray(data.rooms))throw new Error('SERVICE_UNAVAILABLE');
    return data;
  }
  async function dbRead(name,jwt){
    const url=TEST+'/'+encodeURIComponent(name)+'.json?auth='+encodeURIComponent(jwt);
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error('FIREBASE_ERROR');
    let data=await r.json();
    if(typeof data==='string')data=JSON.parse(data);
    return data;
  }
  function dayFromISO(value){
    if(!/^\d{4}-\d\d-\d\d$/.test(value||''))return NaN;
    const utc=Date.UTC(+value.slice(0,4),+value.slice(5,7)-1,+value.slice(8));
    if(new Date(utc).toISOString().slice(0,10)!==value)return NaN;
    return 15+Math.round((utc-ANCHOR)/86400000);
  }
  function dateFromDay(dia){
    return new Date(ANCHOR+(dia-15)*86400000).toISOString().slice(0,10);
  }
  function reset(text){
    items=[];result=[];selectedInv='';shown=0;
    const row=make('tr'),cell=make('td',text,'empty-cell');cell.colSpan=5;row.append(cell);
    el('reg-body').replaceChildren(row);
    for(const id of ['reg-total','reg-days','reg-streets','reg-count'])el(id).textContent='—';
    el('reg-desc').textContent=text;el('reg-print').disabled=true;el('reg-more').hidden=true;
  }
  function roomChanged(){
    const sala=el('reg-room').value,select=el('reg-inv'),previous=select.value;
    select.replaceChildren(new Option('Seleccionar invernadero',''));
    houses.filter(h=>!sala||h.roomId===sala).forEach(h=>
      select.append(new Option(h.label+' ('+h.id+')'+(h.active?'':' · inactivo'),h.id))
    );
    if([...select.options].some(o=>o.value===previous))select.value=previous;
    reset('Pulsa Consultar para obtener los registros de este invernadero.');
  }
  function handoff(action,row){
    if(!selectedInv||!row||busy)return;
    sessionStorage.setItem(BACKOFFICE_FILTERS,JSON.stringify({
      room:el('reg-room').value,inv:el('reg-inv').value,
      from:el('reg-start').value,to:el('reg-end').value,term:el('reg-search').value
    }));
    sessionStorage.setItem(HANDOFF,JSON.stringify({
      action,invId:selectedInv,dia:row.dia,calle:row.calle,ts:Date.now()
    }));
    location.assign('../');
  }
  function more(){
    const body=el('reg-body');if(!shown)body.replaceChildren();
    const batch=result.slice(shown,shown+120);
    for(const r of batch){
      const tr=make('tr');
      const date=new Date(r.iso+'T12:00:00').toLocaleDateString('es-ES');
      tr.append(make('td',date));
      tr.append(make('td','INV '+selectedInv+' · Calle '+r.calle));
      tr.append(make('td',r.text));
      tr.append(make('td',r.user||'No registrado'));
      const actions=make('td');actions.className='actions-col';
      for(const [action,label] of [['edit','Editar'],['print','Imprimir']]){
        const btn=make('button',label,'action-button');
        btn.type='button';btn.addEventListener('click',()=>handoff(action,r));actions.append(btn);
      }
      tr.append(actions);body.append(tr);
    }
    shown+=batch.length;
    el('reg-more').hidden=shown>=result.length;
    el('reg-count').textContent=shown+' de '+result.length+' registros';
  }
  function display(){
    const filter=el('reg-search').value.trim().toLocaleLowerCase('es');
    result=items.filter(r=>!filter||(r.text+' '+r.user+' '+r.calle).toLocaleLowerCase('es').includes(filter));
    shown=0;
    el('reg-total').textContent=String(result.length);
    el('reg-days').textContent=String(new Set(result.map(r=>r.dia)).size);
    el('reg-streets').textContent=String(new Set(result.map(r=>r.calle)).size);
    el('reg-print').disabled=!result.length;
    el('reg-desc').textContent='INV '+selectedInv+' · '+el('reg-start').value+' a '+el('reg-end').value;
    if(!result.length){
      const tr=make('tr'),cell=make('td','No hay registros con estos filtros.','empty-cell');
      cell.colSpan=5;tr.append(cell);el('reg-body').replaceChildren(tr);
      el('reg-more').hidden=true;el('reg-count').textContent='0 resultados';return;
    }
    more();
  }
  async function query(){
    if(busy)return;
    const inv=el('reg-inv').value,start=dayFromISO(el('reg-start').value),end=dayFromISO(el('reg-end').value);
    if(!inv){feedback('Selecciona un invernadero.',true);return;}
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<15||end<start||end-start>90){
      feedback('Selecciona fechas válidas (hasta 91 días por consulta).',true);return;
    }
    busy=true;el('reg-query').disabled=true;el('reg-reload').disabled=true;
    reset('Consultando Firebase TEST…');feedback('',false);
    try{
      const jwt=await token();
      await adminData(jwt); // Permisos ADMIN verificados por servidor en cada consulta.
      const index=await dbRead('lasala-riego-v2-index',jwt);
      if(!Array.isArray(index))throw new Error('INVALID_INDEX');
      const data=await dbRead('lasala-riego-v2-'+inv,jwt);
      if(data==null&&index.map(String).includes(inv))throw new Error('MISSING_SHARD');
      if(data!=null&&(typeof data!=='object'||Array.isArray(data)))throw new Error('INVALID_SHARD');
      const registros=[];
      for(const [d,streets] of Object.entries(data||{})){
        const dia=Number(d);
        if(!Number.isInteger(dia)||dia<start||dia>end||!streets||typeof streets!=='object'||Array.isArray(streets))continue;
        for(const [calle,raw] of Object.entries(streets)){
          if(!/^\d{1,3}$/.test(calle))continue;
          const text=typeof raw==='string'?raw:(raw&&typeof raw==='object'?raw.texto:'');
          if(typeof text!=='string'||!text.trim())continue;
          const user=raw&&typeof raw==='object'&&typeof raw.marcadoPor==='string'?raw.marcadoPor:'';
          registros.push({dia,calle,iso:dateFromDay(dia),text:text.trim(),user});
        }
      }
      registros.sort((a,b)=>b.dia-a.dia||a.calle.localeCompare(b.calle,'es',{numeric:true}));
      items=registros;selectedInv=inv;display();
    }catch(e){
      reset('Consulta no disponible.');
      const msg=e.message==='LOGIN_REQUIRED'?'La sesión ha caducado. Inicia sesión como ADMIN.':
        e.message==='NO_PERMISSION'?'Necesitas una cuenta ADMIN activa.':
        e.message==='MISSING_SHARD'?'El índice v2 referencia un invernadero sin datos.':
        'No se ha podido consultar Firebase TEST. No se han modificado registros.';
      feedback(msg,true);
      if(['LOGIN_REQUIRED','NO_PERMISSION'].includes(e.message))gate('Acceso restringido',msg);
    }finally{busy=false;el('reg-query').disabled=false;el('reg-reload').disabled=false;}
  }
  async function boot(){
    const now=new Date(),prev=new Date(now);
    prev.setDate(prev.getDate()-13);
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    el('reg-start').value=iso(prev)<'2026-06-15'?'2026-06-15':iso(prev);
    el('reg-end').value=iso(now);
    el('reg-room').addEventListener('change',roomChanged);
    el('reg-inv').addEventListener('change',()=>reset('Pulsa Consultar para actualizar los registros.'));
    el('reg-form').addEventListener('submit',e=>{e.preventDefault();query();});
    el('reg-reload').addEventListener('click',query);
    el('reg-more').addEventListener('click',more);
    el('reg-print').addEventListener('click',()=>{if(result.length)handoff('print',result[0]);});
    el('reg-search').addEventListener('input',()=>{if(selectedInv&&!busy)display();});
    try{
      const data=await adminData(await token());
      houses=data.greenhouses;
      el('session-user').textContent=data.currentUser||'Administrador';
      data.rooms.forEach(room=>el('reg-room').append(new Option(room.label+(room.active?'':' · inactiva'),room.id)));
      roomChanged();el('access-gate').hidden=true;el('workspace').hidden=false;
      // Restaurar los filtros y volver a consultar Firebase al regresar.
      let previous=null;
      try{
        const value=sessionStorage.getItem(BACKOFFICE_FILTERS);
        if(value)previous=JSON.parse(value);
      }catch(e){}finally{sessionStorage.removeItem(BACKOFFICE_FILTERS);}
      if(previous && typeof previous==='object'){
        if([...el('reg-room').options].some(o=>o.value===previous.room)){
          el('reg-room').value=previous.room;roomChanged();
        }
        if([...el('reg-inv').options].some(o=>o.value===previous.inv))
          el('reg-inv').value=previous.inv;
        if(typeof previous.from==='string')el('reg-start').value=previous.from;
        if(typeof previous.to==='string')el('reg-end').value=previous.to;
        if(typeof previous.term==='string')el('reg-search').value=previous.term;
        if(el('reg-inv').value)await query();
      }
    }catch(e){gate('Acceso restringido',e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP como ADMIN.':
      e.message==='NO_PERMISSION'?'Necesitas una cuenta ADMIN activa.':'No se pudo confirmar el acceso a Firebase TEST.');}
  }
  boot();
})();