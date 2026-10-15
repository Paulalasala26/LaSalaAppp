'use strict';
// Consulta administrativa Control TEST. Nunca escribe ni elimina datos de Control.
(function(){
  const STORE='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const TEST_DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
  const HANDOFF='lasala-backoffice-control-v1';
  const RETURN_FILTERS='lasala-backoffice-control-filtros-v1';
  const START=Date.UTC(2026,5,15),PAGE=100;
  const CATS=[
    ['color','Color',{verde:'Verde',amarillo:'Amarillo',verdeClaro:'Verde claro',ok:'OK'}],
    ['tamano','Tamaño',{grande:'Grande',pequeno:'Pequeño',ok:'OK'}],
    ['sanidad','Sanidad',{ok:'OK',enferma:'Enferma'}],
    ['flores','Flores',{si:'Sí',no:'No'}],
    ['raices','Raíces',{pocaRaiz:'Poca raíz',raizVariedad:'Raíz en variedad',ok:'OK'}]
  ];
  const DISEASES={hojasManchadas:'Hojas manchadas',hojasAmarillas:'Hojas amarillas',
    tuta:'Tuta',minador:'Minador',pulgon:'Pulgón',oidio:'Oídio',alternaria:'Alternaria',botritis:'Botritis'};
  const el=id=>document.getElementById(id);
  let all=[],filtered=[],cursor=0,loaded=false,busy=false;
  function node(tag,value,cls){
    const x=document.createElement(tag);
    if(value!==null&&value!==undefined)x.textContent=String(value);
    if(cls)x.className=cls;return x;
  }
  function feedback(value,error){
    const e=el('qc-feedback');e.hidden=!value;e.textContent=value||'';
    e.className='operation-feedback '+(error?'error':'ok');
  }
  function gate(title,description){
    el('gate-title').textContent=title;el('gate-description').textContent=description;
    el('gate-link').hidden=false;el('workspace').hidden=true;el('access-gate').hidden=false;
  }
  async function getToken(){
    let st=null;try{st=JSON.parse(localStorage.getItem(STORE)||'null');}catch(e){}
    if(!st?.user||!st?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:st.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const jwt=await r.json();
    if(!jwt.id_token||!jwt.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(STORE,JSON.stringify({user:st.user,refreshToken:jwt.refresh_token}));
    return jwt.id_token;
  }
  async function verifyAdmin(jwt){
    const r=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
    if(r.status===401)throw new Error('LOGIN_REQUIRED');
    if(r.status===403)throw new Error('NO_PERMISSION');
    if(!r.ok)throw new Error('SERVICE_UNAVAILABLE');
    const body=await r.json();
    if(!body||!Array.isArray(body.rooms)||!Array.isArray(body.greenhouses))throw new Error('SERVICE_UNAVAILABLE');
    return body.currentUser||'Administrador';
  }
  async function readTest(key,jwt){
    const url=TEST_DB+'/'+encodeURIComponent(key)+'.json?auth='+encodeURIComponent(jwt);
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)throw new Error('DB_ERROR');
    const data=await r.json();
    return typeof data==='string'?JSON.parse(data):data;
  }
  function day(iso){
    if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return NaN;
    const date=Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));
    if(new Date(date).toISOString().slice(0,10)!==iso)return NaN;
    return 15+Math.round((date-START)/86400000);
  }
  const isoFromDay=d=>new Date(START+(d-15)*86400000).toISOString().slice(0,10);
  const localDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES');
  function complete(rec){
    return CATS.every(([key])=>{
      const values=rec[key];
      return values&&typeof values==='object'&&!Array.isArray(values)&&Object.values(values).some(Boolean);
    });
  }
  function clientVariety(rec){
    return rec.tipo==='tunel'?String(rec.clienteVariedad||''):
      [rec.cliente,rec.variedad].filter(Boolean).join(' — ');
  }
  function locationText(rec){
    const inv=rec.tipo==='carga'?(rec.invernadero||rec.invId):(rec.invId||'');
    if(rec.tipo==='carga')return inv?'INV '+inv:'Sin asignar';
    const spans=Array.isArray(rec.tramos)?rec.tramos:[];
    const street=spans.length?spans.map(t=>t.desde===t.hasta?String(t.desde):t.desde+'–'+t.hasta).join(', '):
      (rec.calleDesde!=null?String(rec.calleDesde)+(rec.calleHasta!=null&&rec.calleHasta!==rec.calleDesde?'–'+rec.calleHasta:''):'');
    return (inv?'INV '+inv:'Sin asignar')+(street?' · C/ '+street:'');
  }
  function empty(message){
    all=[];filtered=[];cursor=0;loaded=false;
    const tr=node('tr'),td=node('td',message,'empty-cell');td.colSpan=6;tr.append(td);
    el('qc-body').replaceChildren(tr);
    for(const k of ['qc-total','qc-complete','qc-pending','qc-partidas','qc-count'])el(k).textContent='—';
    el('qc-table-description').textContent=message;el('qc-more').hidden=true;
  }
  function filterRows(){
    if(!loaded)return;
    const state=el('qc-state').value,term=el('qc-search').value.toLocaleLowerCase('es').trim();
    filtered=all.filter(rec=>{
      if(state==='completados'&&!rec.done)return false;
      if(state==='pendientes'&&rec.done)return false;
      return !term||[rec.partida,rec.clienteVariedad,rec.cliente,rec.variedad,rec.invernadero,rec.invId,rec.observaciones,rec.creadoPor]
        .map(x=>x==null?'':String(x)).join(' ').toLocaleLowerCase('es').includes(term);
    });
    cursor=0;
    const done=filtered.filter(x=>x.done).length;
    el('qc-total').textContent=String(filtered.length);
    el('qc-complete').textContent=String(done);
    el('qc-pending').textContent=String(filtered.length-done);
    el('qc-partidas').textContent=String(new Set(filtered.map(x=>String(x.partida||'').trim()).filter(Boolean)).size);
    el('qc-table-description').textContent=el('qc-from').value+' — '+el('qc-to').value;
    if(!filtered.length){
      const tr=node('tr'),td=node('td','Sin controles con estos filtros.','empty-cell');
      td.colSpan=6;tr.append(td);el('qc-body').replaceChildren(tr);
      el('qc-more').hidden=true;el('qc-count').textContent='0 resultados';return;
    }
    showMore();
  }
  function openNativeEditor(action,rec){
    if(busy||!rec||!['edit','checks'].includes(action))return;
    // Recordar filtros sólo en la sesión de esta pestaña, nunca en la URL.
    sessionStorage.setItem(RETURN_FILTERS,JSON.stringify({
      type:el('qc-type').value,from:el('qc-from').value,to:el('qc-to').value,
      state:el('qc-state').value,search:el('qc-search').value
    }));
    sessionStorage.setItem(HANDOFF,JSON.stringify({
      action,tipo:rec.tipo,dia:rec.dia,id:rec.id,ts:Date.now()
    }));
    location.assign('../');
  }
  function openQuantitativePrototype(rec){
    if(busy||!rec||!['tunel','carga'].includes(rec.tipo))return;
    // Conserva los filtros del listado para el regreso desde la ficha.
    sessionStorage.setItem(RETURN_FILTERS,JSON.stringify({
      type:el('qc-type').value,from:el('qc-from').value,to:el('qc-to').value,
      state:el('qc-state').value,search:el('qc-search').value
    }));
    // Enlace de SOLO lectura: selector efímero, sin exponer IDs en la URL.
    sessionStorage.setItem('lasala-qc-prototipo-ref-v1',JSON.stringify({
      tipo:rec.tipo,dia:rec.dia,id:rec.id,ts:Date.now(),from:'list'
    }));
    location.assign('./qc-ficha.html');
  }
  function showMore(){
    if(!cursor)el('qc-body').replaceChildren();
    const next=filtered.slice(cursor,cursor+PAGE);
    for(const rec of next){
      const row=node('tr'),when=node('td');
      when.append(node('span',localDate(rec.iso),'qc-main'));
      when.append(node('span',rec.tipo==='tunel'?'Check Túnel':'Check Carga','qc-secondary'));
      row.append(when,node('td',rec.partida||'—','qc-main'),node('td',clientVariety(rec)||'—'),
        node('td',locationText(rec)));
      const status=node('td');
      status.append(node('span',rec.done?'Completado':'Pendiente','qc-status '+(rec.done?'ok':'pending')));
      row.append(status);
      const actions=node('td');actions.className='actions-col';
      const open=node('button','Abrir QC','action-button');open.type='button';
      open.title='Ficha QC: detalle, edición tradicional y mediciones por cantidad';
      open.addEventListener('click',()=>openQuantitativePrototype(rec));actions.append(open);
      row.append(actions);
      el('qc-body').append(row);
    }
    cursor+=next.length;el('qc-count').textContent=cursor+' de '+filtered.length+' registros';
    el('qc-more').hidden=cursor>=filtered.length;
  }
  function addField(root,label,value){
    const box=node('div',null,'qc-detail-field');
    box.append(node('span',label),node('strong',value==null||value===''?'—':value));root.append(box);
  }
  function detail(rec){
    el('qc-modal-title').textContent='Partida '+(rec.partida||'sin número');
    const body=el('qc-modal-body'),grid=node('div',null,'qc-detail-grid');
    addField(grid,'Tipo',rec.tipo==='tunel'?'Check Túnel':'Check Carga');
    addField(grid,'Fecha',localDate(rec.iso));
    addField(grid,'Nº partida',rec.partida);
    if(rec.tipo==='carga'){
      addField(grid,'Cliente',rec.cliente);addField(grid,'Variedad',rec.variedad);
    }else addField(grid,'Cliente y variedad',rec.clienteVariedad);
    addField(grid,'Nº bandejas',rec.numBandejas);
    addField(grid,'Invernadero y calle',locationText(rec));
    addField(grid,'Estado',rec.done?'Completado':'Pendiente');
    addField(grid,'Creado por',rec.creadoPor);addField(grid,'Fecha de creación',rec.creadoEn);
    if(rec.fentrega)addField(grid,'Fecha de entrega',rec.fentrega);
    body.replaceChildren(grid,node('h3','Evaluaciones','qc-detail-heading'));
    const checks=node('div',null,'qc-checks');
    for(const [key,label,labels] of CATS){
      const obj=rec[key],names=obj&&typeof obj==='object'&&!Array.isArray(obj)?
        Object.entries(obj).filter(([,v])=>!!v).map(([k])=>labels[k]||k):[];
      addField(checks,label,names.length?names.join(', '):'Sin responder');
    }
    body.append(checks);
    const illnesses=rec.sanidadEnfermedades;
    if(illnesses&&typeof illnesses==='object'&&!Array.isArray(illnesses)){
      const d=Object.entries(illnesses).filter(([,v])=>!!v).map(([k])=>DISEASES[k]||k);
      if(d.length){
        body.append(node('h3','Sanidad: detalle','qc-detail-heading'));
        const di=node('div',null,'qc-detail-grid');addField(di,'Enfermedades / incidencias',d.join(', '));body.append(di);
      }
    }
    body.append(node('h3','Observaciones','qc-detail-heading'));
    const notes=node('div',null,'qc-detail-grid');
    addField(notes,'Observaciones',rec.observaciones||'Sin observaciones');body.append(notes);
    el('qc-modal').hidden=false;el('qc-modal-close').focus();
  }
  function closeDetail(){el('qc-modal').hidden=true;}
  async function fetchSlices(jwt,min,max,type){
    const index=await readTest('lasala-control-items-v2-index',jwt);
    if(!index||typeof index!=='object'||!index.shards||typeof index.shards!=='object'||Array.isArray(index.shards))
      throw new Error('INVALID_INDEX');
    const qMin=Math.max(0,Math.floor((min-15)/14)),qMax=Math.floor((max-15)/14);
    const types=type==='todos'?['tunel','carga']:[type],wanted=[];
    for(const t of types)for(let q=qMin;q<=qMax;q++){
      const meta=index.shards[t+'|'+q];
      if(!meta)continue;
      const name='lasala-control-items-v2-'+t+'-q'+q;
      if(meta.key!==name||meta.tipo!==t||Number(meta.q)!==q)throw new Error('INVALID_INDEX');
      wanted.push({name,t,q});
    }
    const slices=[];
    for(let i=0;i<wanted.length;i+=4){
      const batch=await Promise.all(wanted.slice(i,i+4).map(async x=>{
        const obj=await readTest(x.name,jwt);
        if(obj==null||typeof obj!=='object'||Array.isArray(obj))throw new Error('INVALID_SLICE');
        return {...x,items:obj};
      }));
      slices.push(...batch);
    }
    return slices;
  }
  async function query(){
    if(busy)return;
    const min=day(el('qc-from').value),max=day(el('qc-to').value),type=el('qc-type').value;
    if(!['todos','tunel','carga'].includes(type)||!Number.isInteger(min)||!Number.isInteger(max)||
       min<15||max<min||max-min>90){
      feedback('Indica un rango válido de hasta 91 días, desde 15/06/2026.',true);return;
    }
    busy=true;el('qc-query').disabled=true;el('qc-reload').disabled=true;
    empty('Cargando registros de calidad…');feedback('Consultando las quincenas de Control…');
    try{
      const jwt=await getToken();
      await verifyAdmin(jwt);
      const shards=await fetchSlices(jwt,min,max,type),found=[],ids=new Set();
      for(const {items,t} of shards){
        for(const [id,rec] of Object.entries(items)){
          if(!rec||typeof rec!=='object'||Array.isArray(rec)||rec.id!==id||rec.tipo!==t||
             !Number.isInteger(rec.dia)||rec.dia<min||rec.dia>max)continue;
          if(ids.has(id))throw new Error('DUPLICATE_ID');
          ids.add(id);found.push({...rec,iso:isoFromDay(rec.dia),done:!!complete(rec)});
        }
      }
      found.sort((a,b)=>b.dia-a.dia||a.tipo.localeCompare(b.tipo)||
        String(a.partida||'').localeCompare(String(b.partida||''),'es',{numeric:true}));
      all=found;loaded=true;filterRows();feedback('');
    }catch(error){
      empty('Consulta no disponible.');
      const msg=error.message==='LOGIN_REQUIRED'?'La sesión ha caducado. Entra como ADMIN.':
        error.message==='NO_PERMISSION'?'Solo usuarios ADMIN activos.':
        ['INVALID_INDEX','INVALID_SLICE','DUPLICATE_ID'].includes(error.message)?
        'El índice de Control v2 o sus datos son inconsistentes. No se muestran resultados incompletos.':
        'No se han podido consultar los registros. Ningún registro ha sido modificado.';
      feedback(msg,true);
      if(['LOGIN_REQUIRED','NO_PERMISSION'].includes(error.message))gate('Acceso restringido',msg);
    }finally{busy=false;el('qc-query').disabled=false;el('qc-reload').disabled=false;}
  }
  function defaultDates(){
    const now=new Date(),prev=new Date(now);prev.setDate(now.getDate()-29);
    const iso=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    el('qc-to').value=iso(now);el('qc-from').value=iso(prev)<'2026-06-15'?'2026-06-15':iso(prev);
  }
  async function boot(){
    defaultDates();
    el('qc-form').addEventListener('submit',e=>{e.preventDefault();query();});
    el('qc-reload').addEventListener('click',query);
    el('qc-more').addEventListener('click',showMore);
    el('qc-state').addEventListener('change',filterRows);
    el('qc-search').addEventListener('input',filterRows);
    for(const id of ['qc-type','qc-from','qc-to']){
      el(id).addEventListener('change',()=>empty('Pulsa Consultar para cargar los nuevos filtros.'));
    }
    el('qc-modal-close').addEventListener('click',closeDetail);
    el('qc-modal-ok').addEventListener('click',closeDetail);
    el('qc-modal').addEventListener('click',e=>{if(e.target===el('qc-modal'))closeDetail();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('qc-modal').hidden)closeDetail();});
    try{
      el('session-user').textContent=await verifyAdmin(await getToken());
      el('workspace').hidden=false;el('access-gate').hidden=true;
      // Al volver desde Control, restaurar filtros y consultar de nuevo Firebase TEST.
      let previous=null;
      try{
        const saved=sessionStorage.getItem(RETURN_FILTERS);
        if(saved)previous=JSON.parse(saved);
      }catch(e){}finally{sessionStorage.removeItem(RETURN_FILTERS);}
      if(previous && typeof previous==='object'){
        for(const [id,value] of [
          ['qc-type',previous.type],['qc-from',previous.from],
          ['qc-to',previous.to],['qc-state',previous.state],['qc-search',previous.search]
        ]){
          const input=el(id);
          if(typeof value==='string' && input && (input.tagName!=='SELECT' || Array.from(input.options).some(o=>o.value===value))){
            input.value=value;
          }
        }
      }
      // Siempre consultar al entrar: anteriormente solo cargaba tras recuperar filtros.
      await query();
    }catch(e){
      gate('Acceso restringido',e.message==='LOGIN_REQUIRED'?'Entra como ADMIN en ViguerAPP.':
        e.message==='NO_PERMISSION'?'No tienes permisos ADMIN activos.':
        'No se ha podido comprobar el acceso a los datos.');
    }
  }
  boot();
})();
