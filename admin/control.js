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
      state:el('qc-state').value,search:el('qc-search').value,selected:rec.id
    }));
    // Enlace de SOLO lectura: selector efímero, sin exponer IDs en la URL.
    sessionStorage.setItem('lasala-qc-prototipo-ref-v1',JSON.stringify({
      tipo:rec.tipo,dia:rec.dia,id:rec.id,ts:Date.now(),from:'list'
    }));
    location.assign('./qc-ficha.html');
  }

  // Piloto de foto desde una partida QC del Backoffice, solo ADMIN.
  // No altera la captura heredada de los operarios ni su cola offline.
  let photoPilotRecord=null,photoPilotPending=null,photoPilotBusy=false;
  function photoPilotMessage(message,error){
    const output=el('qc-photo-connection-status');
    output.hidden=false;
    output.className='operation-feedback '+(error?'error':'ok');
    output.textContent=message;
  }
  function openPhotoPilot(rec){
    if(photoPilotBusy)return;
    if(photoPilotPending){
      if(photoPilotPending.id===rec.id){
        void sendPhotoPilot();
      }else{
        photoPilotMessage('Hay una foto pendiente de la partida '+photoPilotPending.partida+
          '. Vuelve a su fila para reintentar la subida. No se ha descartado.',true);
      }
      return;
    }
    if(navigator.onLine===false){
      photoPilotMessage('Sin conexión: no se ha hecho ninguna subida. Prueba cuando recuperes señal.',true);
      return;
    }
    photoPilotRecord={id:rec.id,tipo:rec.tipo,dia:rec.dia,partida:rec.partida};
    const input=el('qc-photo-test-file');
    input.value='';
    input.click();
  }
  async function encodePilotPhoto(file){
    if(!file||!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
      throw new Error('PHOTO_FORMAT');
    // Decodificar a menor resolución si el navegador lo permite para evitar
    // cargar en memoria imágenes móviles de decenas de megapíxeles.
    if(typeof createImageBitmap==='function'){
      let bitmap=null;
      try{
        bitmap=await createImageBitmap(file,{resizeWidth:1280,resizeQuality:'medium'});
        const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const encoded=canvas.toDataURL('image/jpeg',0.75);
        canvas.width=0;canvas.height=0;
        if(encoded.length<=3500000&&encoded.length>200)return encoded;
        throw new Error('PHOTO_SIZE');
      }catch(err){
        if(err.message==='PHOTO_SIZE')throw err;
        // HEIC puede no ser decodificable en algunos navegadores.
      }finally{if(bitmap)bitmap.close();}
    }
    if(file.size>2450000)throw new Error('PHOTO_SIZE');
    const encoded=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('PHOTO_READ'));
      reader.readAsDataURL(file);
    });
    if(typeof encoded!=='string'||encoded.length>3500000)throw new Error('PHOTO_SIZE');
    return encoded;
  }
  async function sendPhotoPilot(){
    const item=photoPilotPending;
    if(photoPilotBusy||!item)return;
    photoPilotBusy=true;
    photoPilotMessage('Guardando fotografía en SharePoint…');
    try{
      const jwt=await getToken();
      const response=await fetch('/api/qc-fotos-sharepoint',{
        method:'POST',headers:{
          Authorization:'Bearer '+jwt,'Content-Type':'application/json'
        },
        body:JSON.stringify({
          id:item.id,tipo:item.tipo,dia:item.dia,photoId:item.photoId,
          capturedAt:item.capturedAt,imageData:item.imageData
        }),cache:'no-store',signal:AbortSignal.timeout(45000)
      });
      let result={};try{result=await response.json();}catch(e){}
      if(!response.ok||result.ok!==true){
        const errors={
          SHAREPOINT_UPLOAD_NOT_ENABLED:'La subida sigue desactivada en Vercel TEST.',
          PILOT_ADMIN_ONLY:'Solo ADMIN puede realizar esta prueba.',
          PHOTO_INDEX_CONFLICT:'Existe un conflicto al registrar esta foto.',
          GRAPH_SELECTED_PERMISSION_DENIED:'Graph no autoriza la escritura en Fotos QC.',
          GRAPH_UPLOAD_FAILED:'SharePoint no ha confirmado la subida.',
          PHOTO_TOO_LARGE:'La foto supera el tamaño permitido.',
          CONTROL_RECORD_CHANGED:'La ficha de Control ha cambiado. No se ha subido.',
          PHOTO_INDEX_WRITE_FAILED:'SharePoint pudo recibir la foto, pero Firebase no confirmó el índice.'
        };
        throw new Error(errors[result.error]||
          'Subida no confirmada (HTTP '+response.status+', '+(result.error||'error desconocido')+').');
      }
      if(result.photoId!==item.photoId||!result.record?.sharepoint?.itemId)
        throw new Error('No se ha podido verificar el vínculo de la fotografía.');
      photoPilotPending=null;
      const msg='✓ Foto QC vinculada a '+item.partida+' y guardada en SharePoint: '+
        result.record.sharepoint.name;
      photoPilotMessage(msg);
      const url=result.record.sharepoint.webUrl;
      if(typeof url==='string'&&url.startsWith('https://viveroslasala.sharepoint.com/')){
        const link=node('a','Ver foto en SharePoint');
        link.href=url;link.target='_blank';link.rel='noopener noreferrer';
        link.style.marginLeft='8px';
        el('qc-photo-connection-status').append(link);
      }
    }catch(error){
      photoPilotMessage('✗ '+error.message+
        ' La foto sigue pendiente en esta pestaña: pulsa otra vez la cámara de la misma partida para reintentar.',true);
    }finally{photoPilotBusy=false;}
  }
  async function capturePhotoPilot(){
    const input=el('qc-photo-test-file'),file=input.files?.[0],rec=photoPilotRecord;
    photoPilotRecord=null;
    if(!file||!rec||photoPilotBusy)return;
    photoPilotBusy=true;
    photoPilotMessage('Preparando fotografía…');
    try{
      const imageData=await encodePilotPhoto(file);
      if(typeof crypto?.randomUUID!=='function')throw new Error('El navegador no admite identificadores únicos.');
      photoPilotPending={...rec,photoId:crypto.randomUUID(),
        capturedAt:new Date().toISOString(),imageData};
    }catch(error){
      photoPilotMessage(error.message==='PHOTO_SIZE'?
        'No se puede preparar esta foto por su tamaño. No se ha enviado a SharePoint.':
        'No se ha podido leer la foto. No se ha enviado a SharePoint.',true);
    }finally{photoPilotBusy=false;input.value='';}
    if(photoPilotPending)await sendPhotoPilot();
  }
  function showMore(){
    if(!cursor)el('qc-body').replaceChildren();
    const next=filtered.slice(cursor,cursor+PAGE);
    for(const rec of next){
      const row=node('tr'),when=node('td');
      row.dataset.qcId=rec.id;
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
      const camera=node('button','📷','action-button');camera.type='button';
      camera.title='Piloto TEST: hacer foto QC y guardarla en SharePoint (solo ADMIN)';
      camera.setAttribute('aria-label','Foto QC · '+(rec.partida||'partida'));
      camera.addEventListener('click',()=>openPhotoPilot(rec));actions.append(camera);
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
  // Diagnóstico a petición del administrador: solo consulta la carpeta QC.
  // No crea archivos, no escribe fotos ni modifica permisos.
  async function checkQCPhotoConnection(){
    const button=el('qc-photo-connection'),status=el('qc-photo-connection-status');
    if(button.disabled)return;
    button.disabled=true;
    const previous=button.textContent;
    button.textContent='Comprobando conexión…';
    status.hidden=false;
    status.className='operation-feedback';
    status.textContent='Comprobando acceso de ViguerAPP a SharePoint…';
    try{
      const jwt=await getToken();
      const response=await fetch('/api/qc-fotos-sharepoint?action=check',{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store',
        signal:AbortSignal.timeout(30000)
      });
      let result={};
      try{result=await response.json();}catch(e){}
      if(response.ok&&result.ok===true&&result.graphRead==='CONFIRMED'){
        if(result.uploadEnabled===true){
          status.textContent='✓ SharePoint conectado · Piloto de fotos habilitado solo para ADMIN en TEST.';
          status.className='operation-feedback ok';
        }else{
          status.textContent='✓ Acceso a SharePoint confirmado · Fotos QC. Subida de fotos desactivada.';
          status.className='operation-feedback ok';
        }
        // Si hay una partida concreta filtrada, verificar sus datos de
        // ubicación con la API (lectura directa de Carga y Túnel en Firebase).
        // No se crea ninguna foto, carpeta ni registro.
        const searched=(el('qc-search')?.value||'').trim().toUpperCase();
        const selected=loaded&&searched?
          filtered.filter(r=>r.tipo==='carga'&&
            String(r.partida||'').trim().toUpperCase()===searched):[];
        if(selected.length>0&&selected.length<=5){
          for(const record of selected){
            const url='/api/qc-fotos-sharepoint?'+new URLSearchParams({
              id:record.id,tipo:record.tipo,dia:String(record.dia)
            });
            const check=await fetch(url,{method:'GET',
              headers:{Authorization:'Bearer '+jwt},cache:'no-store',
              signal:AbortSignal.timeout(30000)});
            let body={};try{body=await check.json();}catch(e){}
            const line=node('div',null);
            line.style.marginTop='7px';
            if(check.ok&&body.ok===true&&body.metadata){
              const m=body.metadata;
              const inv=m.invernadero?'INV '+m.invernadero:'Invernadero no determinado';
              const calle=Array.isArray(m.tramos)&&m.tramos.length?
                m.tramos.map(t=>t.desde===t.hasta?String(t.desde):t.desde+'–'+t.hasta).join(', '):
                'Calle no determinada';
              const origin=m.ubicacionOrigen==='tunel'?
                'Túnel ('+(m.registroTunelOrigen||m.ubicacionEstado)+')':
                'Carga ('+(m.ubicacionEstado||'directa')+')';
              line.textContent='Partida '+record.partida+': '+inv+' · Calle '+calle+
                ' · Origen '+origin;
            }else{
              line.textContent='Partida '+record.partida+
                ': no se ha podido verificar la ubicación (HTTP '+check.status+').';
            }
            status.append(line);
          }
        }
      }else{
        const errors={
          GRAPH_NOT_CONFIGURED:'Faltan credenciales de Microsoft Graph en Vercel TEST.',
          GRAPH_TOKEN_FAILED:'Microsoft Entra ha rechazado la autenticación de ViguerAPP. Revisa el secreto.',
          GRAPH_ID_MISMATCH:'El identificador de la aplicación no coincide con ViguerAPP QC.',
          GRAPH_FOLDER_PERMISSION_DENIED:'ViguerAPP no tiene permiso de lectura sobre la carpeta Fotos QC.',
          GRAPH_FOLDER_READ_FAILED:'Microsoft Graph no ha podido leer la carpeta Fotos QC.',
          GRAPH_FOLDER_MISMATCH:'La carpeta configurada no coincide con Fotos QC.',
          FORBIDDEN:'La cuenta no tiene permisos para esta operación.',
          UNAUTHORIZED:'Tu sesión ha caducado. Vuelve a iniciar sesión.'
        };
        status.textContent=errors[result.error]||'No se ha podido verificar SharePoint (HTTP '+response.status+').';
        status.className='operation-feedback error';
      }
    }catch(e){
      status.textContent=e.message==='LOGIN_REQUIRED'?
        'Tu sesión ha caducado. Vuelve a iniciar sesión.':
        'Sin respuesta de SharePoint. Comprueba la conexión e inténtalo de nuevo.';
      status.className='operation-feedback error';
    }finally{
      button.disabled=false;
      button.textContent=previous;
    }
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
    el('qc-photo-test-file').addEventListener('change',capturePhotoPilot);
    el('qc-photo-connection').addEventListener('click',checkQCPhotoConnection);
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
      // Tras volver de una ficha, mantener visible la línea de la que se salió.
      if(previous&&typeof previous.selected==='string'&&loaded){
        const pos=filtered.findIndex(x=>x.id===previous.selected);
        if(pos>=0){
          while(cursor<=pos&&cursor<filtered.length)showMore();
          const row=Array.from(el('qc-body').querySelectorAll('tr[data-qc-id]'))
            .find(x=>x.dataset.qcId===previous.selected);
          if(row){
            row.classList.add('qc-return-selected');
            row.scrollIntoView({block:'center',behavior:'auto'});
          }
        }
      }
    }catch(e){
      gate('Acceso restringido',e.message==='LOGIN_REQUIRED'?'Entra como ADMIN en ViguerAPP.':
        e.message==='NO_PERMISSION'?'No tienes permisos ADMIN activos.':
        'No se ha podido comprobar el acceso a los datos.');
    }
  }
  boot();
})();
