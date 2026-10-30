'use strict';
/* Backoffice GS: visor de PDF exclusivamente local. No realiza operaciones de escritura. */
(function(){
  const AUTH_STORE='lasala-firebase-auth-v1';
  const FIREBASE_API_KEY='AIzaSyBsRjw4NuCFg69P7_eqoX037rgjkbadcA0';
  const PDF_JS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const byId=id=>document.getElementById(id);
  const fmt=value=>Number(value||0).toLocaleString('es-ES',{maximumFractionDigits:2});
  let busy=false;

  function status(message,error){
    const el=byId('gs-status');
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
  function render(data,file){
    const m=byId('gs-metrics');m.replaceChildren();
    metric(m,'Partidas distintas',data.resumen.partidas);
    metric(m,'Partes de actuación',data.resumen.partes);
    metric(m,'Plantas en partes (no stock)',data.resumen.plantasEnPartes);
    metric(m,'Bandejas en partes (no stock)',data.resumen.bandejasEnPartes);
    byId('gs-source').textContent='Archivo local: '+file.name+' · No se ha guardado ni enviado a Firebase.';
    const errors=byId('gs-errors');
    errors.hidden=!data.errores.length;
    errors.textContent=data.errores.length?'Advertencias de lectura: '+data.errores.join(' '):'';
    const list=byId('gs-parties');list.replaceChildren();
    const heads=['Nº Parte','TSI','Nº Plantas','Nº Bandejas','Localización GS','Fec. entrada','Hora','Salida prevista'];
    for(const partida of data.partidas){
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
        for(const value of [p.numeroParte,p.tsi,fmt(p.plantasEnParte),fmt(p.bandejasEnParte),p.localizacionGS,p.fechaEntrada,p.horaEntrada,p.fechaPrevistaSalida]){
          cell(row,'td',value);
        }
        tbody.appendChild(row);
      }
      table.appendChild(tbody);wrap.appendChild(table);detail.appendChild(wrap);list.appendChild(detail);
    }
    byId('gs-results').hidden=false;
  }
  async function onFile(){
    if(busy)return;
    const file=byId('gs-file').files?.[0];
    if(!file)return;
    byId('gs-results').hidden=true;
    if(!/\.pdf$/i.test(file.name)||file.size>15*1024*1024||!file.size){
      status('Selecciona un PDF válido de 15 MB como máximo.',true);return;
    }
    busy=true;byId('gs-file').disabled=true;
    status('Leyendo documento localmente. No se está importando ningún dato…',false);
    try{
      const parsed=await extract(file);
      render(parsed,file);
      status('Lectura finalizada: '+parsed.resumen.partes+' partes y '+parsed.resumen.partidas+' partidas. '+(parsed.errores.length?'Revisa las advertencias.':'Sin incidencias de formato detectadas.')+' No se ha importado nada.',Boolean(parsed.errores.length));
    }catch(e){
      console.error('Error de lectura GS',e);
      status(e?.message||'Error al leer el documento. No se ha importado nada.',true);
    }finally{busy=false;byId('gs-file').disabled=false;}
  }
  async function boot(){
    byId('gs-file').addEventListener('change',onFile);
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
