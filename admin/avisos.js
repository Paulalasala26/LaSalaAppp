'use strict';
// Backoffice Avisos: lectura exclusivamente; no modificar visto, leido ni resolución.
(function(){
 const AUTH='lasala-firebase-auth-v1';
 const API_KEY='AIzaSyBsRjw4NuCFg69P7_eqoX037rgjkbadcA0';
 const API='/api/admin-qc-dashboard';
 const el=id=>document.getElementById(id);
 let busy=false;
 const number=n=>Number(n).toLocaleString('es-ES');
 const clean=v=>v==null||v===''?'—':String(v);
 const typeLabels={problema_ejecucion:'Problema de ejecución',otro:'Otro aviso'};
 function create(tag,value,cls){
   const x=document.createElement(tag);
   if(value!==undefined&&value!==null)x.textContent=String(value);
   if(cls)x.className=cls;
   return x;
 }
 function feedback(msg,error=false){
   const box=el('av-feedback');box.textContent=msg||'';
   box.hidden=!msg;box.className='av-alert'+(error?' error':'');
 }
 function gate(text){
   el('gate-title').textContent='Acceso restringido';
   el('gate-description').textContent=text;el('gate-link').hidden=false;
   el('access-gate').hidden=false;el('workspace').hidden=true;
 }
 async function token(){
   let saved;
   try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(_){saved=null;}
   if(!saved?.user||!saved?.refreshToken)throw Error('LOGIN_REQUIRED');
   const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
     method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
     cache:'no-store'
   });
   if(!r.ok)throw Error('LOGIN_REQUIRED');
   const obj=await r.json();
   if(!obj.id_token||!obj.refresh_token)throw Error('LOGIN_REQUIRED');
   localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:obj.refresh_token}));
   return obj.id_token;
 }
 function filters(){
   const destinatario=el('av-user').value.trim(),tipo=el('av-type').value,
     estado=el('av-state').value,buscar=el('av-search').value.trim();
   if(!/^[A-Za-z0-9._-]{0,60}$/.test(destinatario))
     throw Error('El identificador del destinatario no es válido.');
   if(!['todos','problema_ejecucion','otros'].includes(tipo)||
      !['todos','sin_leer','leidos','pendiente_solucion','resueltos','evaluados'].includes(estado))
     throw Error('Selecciona un tipo y estado válidos.');
   if(buscar.length>80)throw Error('La búsqueda no puede superar 80 caracteres.');
   return {modo:'avisos',destinatario,tipo,estado,buscar};
 }
 function td(row,value,cls){
   row.append(create('td',clean(value),cls));
 }
 function stat(root,value,label){
   const box=create('div',null,'av-stat');
   box.append(create('strong',number(value)),create('span',label));
   root.append(box);
 }
 function render(data){
   if(data.ok!==true||data.source!=='avisos-usuario-v1'||data.readonly!==true||
      data.completo!==false||!data.totals||!Array.isArray(data.rows))
     throw Error('INVALID_RESPONSE');
   const stats=el('av-stats');stats.replaceChildren();
   stat(stats,data.totals.avisos,'Avisos que cumplen los filtros');
   stat(stats,data.totals.sinLeer,'Sin leer (en la selección)');
   stat(stats,data.totals.problemasPendientes,'Problemas pendientes de solución');
   stat(stats,data.totals.mostrados,'Mostrados');
   el('av-count').textContent='Mostrando '+number(data.totals.mostrados)+' de '+
     number(data.totals.avisos)+' avisos conservados. '+
     (data.totals.avisos>data.totals.mostrados?'Acota la búsqueda para consultar los restantes. ':'')+
     'La lista no refleja avisos eliminados previamente y no modifica sus estados.';
   const body=el('av-body');body.replaceChildren();
   if(!data.rows.length){
     const tr=create('tr'),cell=create('td','No hay avisos conservados para esos filtros.','av-empty');
     cell.colSpan=7;tr.append(cell);body.append(tr);
   }
   for(const a of data.rows){
     const tr=create('tr');
     td(tr,a.fecha,'av-nowrap');
     td(tr,a.destinatario,'av-nowrap');
     const msg=create('td',null,'av-message');
     msg.append(create('strong',a.titulo||'App La Sala'));
     msg.append(create('span',a.mensaje||'—'));
     if(a.observaciones)msg.append(create('small','Observaciones: '+a.observaciones));
     tr.append(msg);
     td(tr,typeLabels[a.tipo]||a.tipo,'av-wrap');
     td(tr,(a.visto?'Visto':'No visto')+' · '+(a.leido?'Leído':'Sin leer'),'av-wrap');
     let state='';
     if(a.tipo==='problema_ejecucion'){
       state=a.resuelto?'Resuelto':'Pendiente de solución';
       if(a.solucion)state+=' · Solución: '+a.solucion;
     }else{
       state=a.evaluacion==='bien'?'Bien evaluado':a.evaluacion==='mal'?'Mal evaluado':'Sin evaluación registrada';
     }
     td(tr,state,'av-wrap');
     td(tr,a.id,'av-wrap');
     body.append(tr);
   }
   el('av-results').hidden=false;
 }
 async function query(ev){
   if(ev)ev.preventDefault();
   if(busy)return;
   let opts;
   try{opts=filters()}catch(e){feedback(e.message,true);return}
   busy=true;el('av-query').disabled=true;el('av-results').hidden=true;
   feedback('Consultando avisos conservados…');
   try{
     const jwt=await token();
     const r=await fetch(API+'?'+new URLSearchParams(opts).toString(),{
       headers:{Authorization:'Bearer '+jwt},cache:'no-store'
     });
     if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
     if(r.status===400)throw Error('INVALID_FILTER');
     if(!r.ok)throw Error('UNAVAILABLE');
     render(await r.json());feedback('');
   }catch(e){
     if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
       gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
     else feedback(e.message==='INVALID_FILTER'?'Revisa destinatario, tipo, estado o búsqueda.':
       'No se han podido leer los avisos. Ningún estado ha sido modificado.',true);
   }finally{busy=false;el('av-query').disabled=false}
 }
 async function boot(){
   el('av-form').addEventListener('submit',query);
   try{
     const jwt=await token();
     const r=await fetch('/api/admin-catalog',{
       headers:{Authorization:'Bearer '+jwt},cache:'no-store'
     });
     if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
     if(!r.ok)throw Error('UNAVAILABLE');
     const catalog=await r.json();
     if(!Array.isArray(catalog.rooms)||!Array.isArray(catalog.greenhouses))throw Error('UNAVAILABLE');
     el('session-user').textContent=catalog.currentUser||'Administrador';
     el('access-gate').hidden=true;el('workspace').hidden=false;
     await query();
   }catch(e){
     gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
       e.message==='NO_PERMISSION'?'Solo administradores activos.':
       'No se ha podido comprobar el acceso al Backoffice.');
   }
 }
 boot();
})();
