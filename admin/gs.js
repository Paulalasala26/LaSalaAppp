'use strict';
/* Backoffice GS: visor de PDF exclusivamente local. No realiza operaciones de escritura. */
(function(){
  const AUTH_STORE='lasala-firebase-auth-v1';
  const FIREBASE_API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const PDF_JS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const byId=id=>document.getElementById(id);
  const fmt=value=>Number(value||0).toLocaleString('es-ES',{maximumFractionDigits:2});
  let busy=false,preview=null,sourceName='';

  function status(message,error,target){
    const el=byId(target||'gs-status');
    el.textContent=message;
    el.className='gs-status '+(error?'error':'ok');
  }
  function gate(description){
    byId('gate-title').textContent='Acceso restringido';
    byId('gate-description').textContent=description;
    byId('gate-link').hidden=false;
    byId('workspace').hidden=true;
    byId('access-gate').hidden=false;
  }
  async function token(){
    let st=null;
    try{st=JSON.parse(localStorage.getItem(AUTH_STORE)||'null');}catch(e){}
    if(!st?.user||!st?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(FIREBASE_API_KEY),{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:st.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const payload=await r.json();
    if(!payload.id_token||!payload.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_STORE,JSON.stringify({user:st.user,refreshToken:payload.refresh_token}));
    return payload.id_token;
  }
  async function verifyAdmin(jwt){
    const r=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
    if(r.status===401)throw new Error('LOGIN_REQUIRED');
    if(r.status===403)throw new Error('NO_PERMISSION');
    if(!r.ok)throw new Error('SERVICE_UNAVAILABLE');
    const data=await r.json();
    if(!Array.isArray(data.rooms)||!Array.isArray(data.greenhouses))throw new Error('SERVICE_UNAVAILABLE');
    return data.currentUser||'Administrador';
  }
  function scriptOnce(src){
    return new Promise((resolve,reject)=>{
      if(window.pdfjsLib){resolve();return}
      const existing=document.querySelector('script[data-gs-pdf]');
      if(existing){
        existing.addEventListener('load',resolve,{once:true});
        existing.addEventListener('error',()=>reject(new Error('No se ha podido cargar el lector PDF')),{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=src;s.dataset.gsPdf='1';
      s.onload=resolve;
      s.onerror=()=>reject(new Error('No se ha podido cargar el lector PDF'));
      document.head.appendChild(s);
    });
  }
  async function extract(file){
    await scriptOnce(PDF_JS);
    if(!window.pdfjsLib||!window.GSReader)throw new Error('El lector GS no está disponible.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDF_WORKER;
    const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pages=[];
    try{
      if(pdf.numPages>100)throw new Error('El PDF supera el máximo de 100 páginas de esta versión.');
      for(let n=1;n<=pdf.numPages;n++){
        const page=await pdf.getPage(n);
        const content=await page.getTextContent();
        const width=page.view[2]-page.view[0];
        if(!width)throw new Error('No se puede interpretar el tamaño de una página.');
        const scale=595/width;
        pages.push({items:content.items.map(it=>({
          str:it.str||'',x:(it.transform?.[4]||0)*scale,y:(it.transform?.[5]||0)*scale
        }))});
      }
      return window.GSReader.parsePages(pages);
    }finally{
      await pdf.destroy();
    }
  }
  function cell(row,tag,value){
    const c=document.createElement(tag);
    c.textContent=String(value==null?'—':value);
    row.appendChild(c);
    return c;
  }
  function metric(parent,label,value){
    const div=document.createElement('div');div.className='gs-metric';
    const val=document.createElement('strong');val.textContent=fmt(value);
    const name=document.createElement('span');name.textContent=label;
    div.append(val,name);parent.appendChild(div);
  }
  function filtered(){
    return preview?window.GSAdminTools.filterPartidas(preview.partidas,byId('gs-filter').value):[];
  }
  function renderPartidas(partidas){
    const list=byId('gs-parties');list.replaceChildren();
    const total=preview?.partidas.length||0;
    byId('gs-filtercount').textContent='Mostrando '+partidas.length+' de '+total+' partidas del PDF.';
    byId('gs-export').disabled=partidas.length===0;
    if(!partidas.length){
      const empty=document.createElement('p');empty.className='gs-empty';
      empty.textContent='No hay partidas que coincidan con esta búsqueda.';
      list.append(empty);return;
    }
    const heads=['Nº Parte','TSI','Cliente GS','PAR_NMSM','Denominación TSI','Nº Plantas','Nº Bandejas','Localización GS','Invernaderos catálogo','Fec. entrada','Hora','Salida prevista'];
    for(const partida of partidas){
      const detail=document.createElement('details');detail.className='gs-party';
      const summary=document.createElement('summary');
      summary.textContent='Partida '+partida.numeroPartida+' · '+partida.partes.length+' parte'+(partida.partes.length===1?'':'s');
      detail.appendChild(summary);
      const wrap=document.createElement('div');wrap.className='gs-table-wrap';
      const table=document.createElement('table');table.className='gs-table';
      const thead=document.createElement('thead'),tr=document.createElement('tr');
      for(const h of heads)cell(tr,'th',h);
      thead.appendChild(tr);table.appendChild(thead);
      const tbody=document.createElement('tbody');
      for(const p of partida.partes){
        const row=document.createElement('tr');
        const ubicaciones=Array.isArray(p.invernaderos)?p.invernaderos.map(inv=>
          inv.resuelto_en_catalogo?String(inv.id)+' · '+String(inv.denominacion||''):
            String(inv.id)+' (sin ficha)'
        ).join(', '):'';
        for(const value of [
          p.numeroParte,p.tsi,p.cliente,p.nombreSemilla,p.tipoSiembra,
          fmt(p.plantasEnParte),fmt(p.bandejasEnParte),p.localizacionGS,
          ubicaciones,p.fechaEntrada,p.horaEntrada,p.fechaPrevistaSalida
        ]){
          cell(row,'td',value);
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);wrap.appendChild(table);detail.appendChild(wrap);list.appendChild(detail);
    }
  }
  function exportSelection(){
    if(busy||!preview||!window.GSAdminTools)return;
    const selection=filtered();
    if(!selection.length)return;
    const csv=window.GSAdminTools.csvPartes(selection);
    const file=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(file);
    const link=document.createElement('a');
    const safeBase=(sourceName.replace(/\.pdf$/i,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,75)||'GS');
    link.href=url;link.download=safeBase+'_partidas_filtradas.csv';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render(data,sourceText){
    const m=byId('gs-metrics');m.replaceChildren();
    metric(m,'Partidas distintas',data.resumen.partidas);
    metric(m,'Partes de actuación',data.resumen.partes);
    metric(m,'Plantas en partes (no stock)',data.resumen.plantasEnPartes);
    metric(m,'Bandejas en partes (no stock)',data.resumen.bandejasEnPartes);
    byId('gs-source').textContent=sourceText;
    const errors=byId('gs-errors');
    errors.hidden=!data.errores.length;
    errors.textContent=data.errores.length?'Advertencias de lectura: '+data.errores.join(' '):'';
    renderPartidas(filtered());
    byId('gs-results').hidden=false;
  }
  async function onFile(){
    if(busy)return;
    const file=byId('gs-file').files?.[0];
    if(!file)return;
    byId('gs-results').hidden=true;
    preview=null;sourceName='';
    byId('gs-filter').value='';
    byId('gs-export').disabled=true;
    if(!/\.pdf$/i.test(file.name)||file.size>15*1024*1024||!file.size){
      status('Selecciona un PDF válido de 15 MB como máximo.',true);return;
    }
    busy=true;byId('gs-file').disabled=true;
    status('Leyendo documento localmente. No se está importando ningún dato…',false);
    try{
      const parsed=await extract(file);
      if(!window.GSAdminTools)throw new Error('Las herramientas administrativas GS no están disponibles.');
      preview=parsed;sourceName=file.name;
      render(parsed,'Archivo local: '+file.name+' · Solo lectura; no se ha guardado en Firebase.');
      status('Lectura finalizada: '+parsed.resumen.partes+' partes y '+parsed.resumen.partidas+' partidas. '+(parsed.errores.length?'Revisa las advertencias.':'Sin incidencias de formato detectadas.')+' No se ha importado nada.',Boolean(parsed.errores.length));
    }catch(e){
      console.error('Error de lectura GS',e);
      status(e?.message||'Error al leer el documento. No se ha importado nada.',true);
    }finally{busy=false;byId('gs-file').disabled=false;}
  }
  function fromMysqlSnapshot(snapshot,date){
    const sourceParts=snapshot?.partes;
    if(!sourceParts||typeof sourceParts!=='object'||Array.isArray(sourceParts))
      throw new Error('La instantánea GS no contiene partes válidos.');
    const groups=new Map();
    const rows=Object.values(sourceParts);
    for(const source of rows){
      const numeroParte=String(source?.gs_injerto_id??'').trim();
      const numeroPartida=String(source?.gs_partida??'').trim();
      if(!numeroParte||!numeroPartida)throw new Error('Parte GS sin número de parte o partida.');
      const part={
        numeroParte,numeroPartida,
        tsi:String(source.id_tipo_siembra??''),
        plantasEnParte:Number(source.plantas||0),
        bandejasEnParte:Number(source.bandejas||0),
        localizacionGS:String(source.invernaderos_gs??''),
        invernaderos:Array.isArray(source.invernaderos)?source.invernaderos:[],
        fechaEntrada:source.fecha_entrada??null,
        horaEntrada:source.hora_entrada??null,
        fechaPrevistaSalida:source.fecha_prevista??date,
        observaciones:source.observaciones??null,
        cliente:source.cliente??null,
        nombreSemilla:source.nombre_semilla??null,
        tipoSiembra:source.tipo_siembra??null
      };
      if(!Number.isFinite(part.plantasEnParte)||!Number.isFinite(part.bandejasEnParte))
        throw new Error('Cantidades inválidas en el parte GS '+numeroParte+'.');
      if(!groups.has(numeroPartida))groups.set(numeroPartida,{numeroPartida,partes:[]});
      groups.get(numeroPartida).partes.push(part);
    }
    const partidas=[...groups.values()].sort((a,b)=>a.numeroPartida.localeCompare(b.numeroPartida,'es',{numeric:true}));
    const partes=partidas.flatMap(item=>item.partes);
    const missing=[...new Set(partes.flatMap(p=>(p.invernaderos||[])
      .filter(inv=>!inv.resuelto_en_catalogo).map(inv=>String(inv.id))))];
    return {
      partidas,
      resumen:{
        partidas:partidas.length,
        partes:partes.length,
        plantasEnPartes:partes.reduce((n,p)=>n+p.plantasEnParte,0),
        bandejasEnPartes:partes.reduce((n,p)=>n+p.bandejasEnParte,0)
      },
      errores:missing.map(id=>'El ID de invernadero '+id+' no tiene ficha en el catálogo GS.')
    };
  }

  async function onDatabaseLoad(){
    if(busy)return;
    const date=byId('gs-db-date').value;
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)){
      status('Selecciona una fecha prevista válida.',true,'gs-db-status');
      return;
    }
    busy=true;
    const button=byId('gs-db-load');
    button.disabled=true;
    status('Consultando la instantánea GS de TEST…',false,'gs-db-status');
    try{
      const jwt=await token();
      const url='/api/admin-catalog?view=gs&date='+encodeURIComponent(date);
      const response=await fetch(url,{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
      if(response.status===401)throw new Error('LOGIN_REQUIRED');
      if(response.status===403)throw new Error('NO_PERMISSION');
      if(response.status===404)throw new Error('SNAPSHOT_NOT_FOUND');
      if(!response.ok)throw new Error('SERVICE_UNAVAILABLE');
      const result=await response.json();
      if(!result.ok||result.date!==date||!result.snapshot)throw new Error('INVALID_RESPONSE');
      preview=fromMysqlSnapshot(result.snapshot,date);
      sourceName='GS_MySQL_'+date;
      byId('gs-filter').value='';
      render(preview,'Instantánea MySQL GS TEST · '+date+' · Solo lectura; inspecciones QC sin modificar.');
      status('Lectura correcta: '+preview.resumen.partes+' partes y '+preview.resumen.partidas+' partidas.',false,'gs-db-status');
    }catch(error){
      console.error('Error al leer GS TEST',error);
      const message=error.message==='LOGIN_REQUIRED'?'La sesión ha caducado. Inicia sesión de nuevo.':
        error.message==='NO_PERMISSION'?'Se necesita el rol ADMIN.':
        error.message==='SNAPSHOT_NOT_FOUND'?'No hay una sincronización GS para esa fecha.':
        error.message==='INVALID_RESPONSE'?'La respuesta GS no tiene el formato esperado.':
        error.message||'No se ha podido leer la sincronización GS.';
      status(message,true,'gs-db-status');
    }finally{
      busy=false;
      button.disabled=false;
    }
  }
  async function boot(){
    byId('gs-file').addEventListener('change',onFile);
    byId('gs-db-load').addEventListener('click',onDatabaseLoad);
    byId('gs-filter').addEventListener('input',()=>{
      if(preview&&!busy)renderPartidas(filtered());
    });
    byId('gs-export').addEventListener('click',exportSelection);
    try{
      const current=await verifyAdmin(await token());
      byId('session-user').textContent=current;
      byId('access-gate').hidden=true;
      byId('workspace').hidden=false;
    }catch(e){
      const label=e?.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
        e?.message==='NO_PERMISSION'?'Se necesita el rol ADMIN.':
        'No se ha podido comprobar el acceso ADMIN.';
      gate(label);
    }
  }
  boot();
})();
