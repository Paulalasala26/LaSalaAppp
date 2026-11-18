'use strict';
// Controles visuales de Preinjerto en TEST.
// Usa el checklist existente, sin importar todavía registros desde GS.
(function(){
  const TYPES={
    preinjerto_variedad:{
      key:'preinjerto_variedad',label:'QC Preinjerto Variedad',icon:'ti-seeding',
      color:'linear-gradient(135deg,#2e7d32,#66bb6a)',
      categories:[
        {key:'color',label:'Color',icon:'ti-palette',gradient:'linear-gradient(135deg,#7b5cf0,#5c8df0)',tint:'#efeafd',options:[['ok','OK'],['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro']]},
        {key:'tamano',label:'Tamaño',icon:'ti-ruler-2',gradient:'linear-gradient(135deg,#5c8df0,#3fc6b0)',tint:'#e8f2fd',options:[['ok','OK'],['grande','Grande'],['pequeno','Pequeño']]},
        {key:'grosor',label:'Grosor',icon:'ti-arrows-horizontal',gradient:'linear-gradient(135deg,#00838f,#4dd0e1)',tint:'#e0f7fa',options:[['ok','OK'],['fino','Fino'],['grueso','Grueso']]},
        {key:'firmeza',label:'Firmeza',icon:'ti-hand-finger',gradient:'linear-gradient(135deg,#6a1b9a,#ab47bc)',tint:'#f3e5f5',options:[['ok','OK'],['duro','Duro'],['tierno','Tierno']]},
        {key:'plagas',label:'Plagas',icon:'ti-bug',gradient:'linear-gradient(135deg,#f5a35c,#f0715c)',tint:'#fdece5',options:[['ok','OK'],['tuta','Tuta'],['minador','Minador'],['pulgon','Pulgón'],['oruga','Oruga'],['trips','Trips']]},
        {key:'enfermedades',label:'Enfermedades',icon:'ti-virus',gradient:'linear-gradient(135deg,#ad1457,#ec407a)',tint:'#fce4ec',options:[['ok','OK'],['alternaria','Alternaria'],['mildiu','Mildiu'],['oidio','Oídio'],['botrytis','Botrytis'],['didymella','Didymella']]}
      ]
    },
    preinjerto_patron:{
      key:'preinjerto_patron',label:'QC Preinjerto Patrón',icon:'ti-plant-2',
      color:'linear-gradient(135deg,#558b2f,#aed581)',
      categories:[
        {key:'grosor',label:'Grosor',icon:'ti-arrows-horizontal',gradient:'linear-gradient(135deg,#00838f,#4dd0e1)',tint:'#e0f7fa',options:[['ok','OK'],['fino','Fino'],['grueso','Grueso']]},
        {key:'firmeza',label:'Firmeza',icon:'ti-hand-finger',gradient:'linear-gradient(135deg,#6a1b9a,#ab47bc)',tint:'#f3e5f5',options:[['ok','OK'],['duro','Duro'],['tierno','Tierno']]},
        {key:'segado',label:'Segado',icon:'ti-scissors',gradient:'linear-gradient(135deg,#d84315,#ff8a65)',tint:'#fbe9e7',options:[['segado','Segado'],['noSegado','No segado']]},
        {key:'plagas',label:'Plagas',icon:'ti-bug',gradient:'linear-gradient(135deg,#f5a35c,#f0715c)',tint:'#fdece5',options:[['ok','OK'],['tuta','Tuta'],['minador','Minador'],['pulgon','Pulgón'],['oruga','Oruga'],['trips','Trips']]},
        {key:'enfermedades',label:'Enfermedades',icon:'ti-virus',gradient:'linear-gradient(135deg,#ad1457,#ec407a)',tint:'#fce4ec',options:[['ok','OK'],['alternaria','Alternaria'],['mildiu','Mildiu'],['oidio','Oídio'],['botrytis','Botrytis'],['didymella','Didymella']]},
        {key:'raices',label:'Raíces',icon:'ti-plant-2',gradient:'linear-gradient(135deg,#c47f00,#e0a530)',tint:'#fbf1e0',options:[['ok','OK'],['pocaRaiz','Poca raíz'],['raizVieja','Raíz vieja']]}
      ]
    }
  };
  const keys=Object.keys(TYPES);
  const keySet=new Set(keys);
  const oldSelect=window.seleccionarSeccionControl;
  const oldPeriod=window.cambiarControlQuincena;
  const oldCard=window.renderControlCardHTML;
  const oldRenderSection=window.renderControlSeccionHTML;
  const oldToolbar=window.renderControlFiltroYAltaHTML;
  const oldFilterLines=window.controlLineasFiltradasInv;
  const oldQuantifiable=window.puedeCuantificarControl;
  const oldShard=window.controlV2ShardDeItem;
  const oldComplete=window.controlLineaCompletada;
  const oldFinalized=window.controlLineaFinalizadaQC;
  const oldLoadStatuses=window.cargarEstadosQCDia;
  const oldMarkMeasured=window.marcarControlQCMedido;
  const oldApply=window.aplicarControlCheckOpcion;
  const oldSummary=window.renderControlResumenHTML;

  let pendingOverlay=null;
  let pendingTab='preinjerto_patron';
  let pendingRows={preinjerto_patron:[],preinjerto_variedad:[]};
  let pendingLoadError=false;
  let pendingUnverifiedGroups=0;
  const pendingUnverifiedRecordIds=new Set();
  const pendingStatusFailures=new Map();
  let pendingBadgeKnown=false;
  let pendingBadgeCheckedAt=0;
  let pendingBadgeLoading=false;
  let pendingDataPromise=null;

  function pendingTotal(){
    return pendingRows.preinjerto_patron.length+pendingRows.preinjerto_variedad.length;
  }

  function updatePendingBadge(){
    const visible=pendingBadgeKnown&&pendingTotal()>0;
    document.querySelectorAll('.qc-preinjerto-pending-dot').forEach(dot=>{
      dot.style.display=visible?'inline-block':'none';
    });
  }

  async function refreshPendingBadge(){
    if(pendingBadgeLoading||pendingOverlay)return;
    if(pendingBadgeKnown&&Date.now()-pendingBadgeCheckedAt<120000){updatePendingBadge();return;}
    pendingBadgeLoading=true;
    try{
      await loadPendingPreinjerto();
      pendingBadgeKnown=true;
      pendingBadgeCheckedAt=Date.now();
      updatePendingBadge();
    }catch(error){
      if(window.console&&console.error)console.error('[QC Preinjerto badge]',error);
    }finally{
      pendingBadgeLoading=false;
    }
  }

  let afterSection=CONTROL_SECCIONES.findIndex(section=>section.key==='carga_injerto');
  keys.forEach(key=>{
    if(CONTROL_SECCIONES.some(section=>section.key===key))return;
    const section={key,label:TYPES[key].label,icon:TYPES[key].icon,color:TYPES[key].color,conCheck:true};
    afterSection+=1;
    CONTROL_SECCIONES.splice(afterSection<0?CONTROL_SECCIONES.length:afterSection,0,section);
  });

  const order=['preinjerto_patron','preinjerto_variedad','tunel','carga','carga_injerto'];
  const orderIndex=new Map(order.map((key,index)=>[key,index]));
  CONTROL_SECCIONES.sort((a,b)=>(orderIndex.get(a.key)??99)-(orderIndex.get(b.key)??99));
  const cargaInjerto=CONTROL_SECCIONES.find(section=>section.key==='carga_injerto');
  if(cargaInjerto)cargaInjerto.icon='ti-truck';

  // Entrada única y discreta desde el resumen. El contenido se carga bajo
  // demanda para no ralentizar la apertura normal de Control de Calidad.
  window.renderControlResumenHTML=function(){
    const html=oldSummary?oldSummary():'<div></div>';
    if(!['ADMIN','TECNICO'].includes(currentUserRole))return html;
    setTimeout(refreshPendingBadge,100);
    const action='<button type="button" data-pending-preinjerto-button onclick="abrirPendientesPreinjerto()" aria-haspopup="dialog" '+
      'style="position:relative;display:flex;grid-column:1 / -1;width:100%;align-items:center;justify-content:space-between;gap:12px;margin-top:0;padding:12px 14px;border:1px solid #b8d1ee;border-radius:12px;background:#f2f7fd;color:#1558a0;text-align:left;cursor:pointer">'+
      '<span style="display:flex;align-items:center;gap:10px;min-width:0">'+
      '<i class="ti ti-clock-hour-4" aria-hidden="true" style="font-size:20px;flex-shrink:0"></i>'+
      '<span><strong style="display:block;font-size:13px">Pendientes de Preinjerto</strong>'+
      '<span style="display:block;margin-top:2px;font-size:11px;color:#526b85">Patrón y Variedad · últimos 30 días</span></span></span>'+
      '<span style="display:flex;align-items:center;gap:9px;flex-shrink:0">'+
      '<span class="qc-preinjerto-pending-dot" role="img" aria-label="Hay pendientes de Preinjerto" title="Hay pendientes de Preinjerto" '+
      'style="position:absolute;top:6px;right:6px;z-index:1;display:'+(pendingBadgeKnown&&pendingTotal()>0?'inline-block':'none')+';width:10px;height:10px;border-radius:50%;background:#dc2626;box-shadow:0 0 0 2px #f2f7fd"></span>'+
      '<i class="ti ti-chevron-right" aria-hidden="true" style="font-size:18px"></i></span></button>';
    const tunnelMarker='onclick="seleccionarSeccionControl(\'tunel\')"';
    const tunnelPosition=html.indexOf(tunnelMarker);
    if(tunnelPosition<0){
      const gridEnd=html.lastIndexOf('</div>');
      return gridEnd<0?html+action:html.slice(0,gridEnd)+action+html.slice(gridEnd);
    }
    const tunnelCardStart=html.lastIndexOf('<div ',tunnelPosition);
    return tunnelCardStart<0?html+action:html.slice(0,tunnelCardStart)+action+html.slice(tunnelCardStart);
  };

  function escPending(value){
    return String(value==null?'':value).replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
  }

  function pendingLocation(record){
    const value=typeof controlQCInfoVisual==='function'
      ?controlQCInfoVisual(record)||{}:{inv:'—',calles:'—'};
    return {inv:String(value.inv||'—'),calles:String(value.calles||'—')};
  }

  function renderPendingRows(){
    if(!pendingOverlay)return;
    const content=pendingOverlay.querySelector('[data-role="pending-list"]');
    if(!content)return;
    const rows=pendingRows[pendingTab]||[];
    if(pendingLoadError){
      content.innerHTML='<div style="padding:18px 12px;text-align:center;color:#9b2c2c;font-size:13px">'+
        'No se pudieron cargar los pendientes. Cierra y vuelve a abrir esta lista.</div>';
      return;
    }
    if(!rows.length){
      content.innerHTML='<div style="padding:22px 12px;text-align:center;color:#60758b;font-size:13px">'+
        'No hay partidas pendientes en los últimos 30 días.</div>';
      return;
    }
    const ordered=[...rows].sort((a,b)=>{
      const la=pendingLocation(a),lb=pendingLocation(b);
      const readyA=la.inv!=='—'&&la.calles!=='—',readyB=lb.inv!=='—'&&lb.calles!=='—';
      if(readyA!==readyB)return readyA?-1:1;
      return la.inv.localeCompare(lb.inv,'es',{numeric:true})||
        la.calles.localeCompare(lb.calles,'es',{numeric:true})||a.dia-b.dia||
        String(a.partida).localeCompare(String(b.partida),'es',{numeric:true});
    });
    content.innerHTML=ordered.map(record=>{
      const location=pendingLocation(record);
      const hasLocation=location.inv!=='—'&&location.calles!=='—';
      const date=riegoDiaToDate(record.dia).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'});
      const customer=[record.cliente,record.variedad].filter(Boolean).join(' · ');
      const place=[location.inv,location.calles!=='—'?'Calle '+location.calles:'Calle pendiente']
        .filter(value=>value&&value!=='—').join(' · ');
      return '<button type="button" data-record-id="'+escPending(record.id)+'" '+
        'style="display:block;width:100%;margin:0 0 8px;padding:11px 12px;border:1px solid #d5e1ef;border-radius:10px;background:#fff;color:#24405e;text-align:left;cursor:pointer">'+
        '<span style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+
        '<strong style="font-size:14px;color:#1558a0">'+escPending(record.partida||'Sin partida')+'</strong>'+
        '<span style="font-size:11px;color:#60758b;white-space:nowrap">Siembra '+date+'</span></span>'+
        (customer?'<span style="display:block;margin-top:3px;font-size:12px;color:#526b85">'+escPending(customer)+'</span>':'')+
        '<span style="display:flex;align-items:center;gap:6px;margin-top:7px;font-size:12px;color:'+(hasLocation?'#355a42':'#8a5a16')+'">'+
        '<i class="ti '+(hasLocation?'ti-map-pin':'ti-map-pin-off')+'" aria-hidden="true"></i>'+escPending(place)+'</span>'+
        '</button>';
    }).join('');
    content.querySelectorAll('[data-record-id]').forEach(button=>button.addEventListener('click',()=>{
      const record=controlChecksData.find(item=>item.id===button.dataset.recordId);
      if(!record)return;
      pendingBadgeKnown=false;
      pendingBadgeCheckedAt=0;
      closePendingOverlay();
      abrirMedicionesControl(record.id);
    }));
  }

  function closePendingOverlay(){
    document.removeEventListener('keydown',pendingEscapeHandler);
    if(pendingOverlay&&pendingOverlay.parentNode)pendingOverlay.parentNode.removeChild(pendingOverlay);
    pendingOverlay=null;
  }

  function setPendingTab(type){
    if(!['preinjerto_patron','preinjerto_variedad'].includes(type))return;
    pendingTab=type;
    if(!pendingOverlay)return;
    pendingOverlay.querySelectorAll('[data-pending-tab]').forEach(button=>{
      const active=button.dataset.pendingTab===type;
      button.setAttribute('aria-selected',active?'true':'false');
      button.style.background=active?'#1558a0':'#f1f5fa';
      button.style.color=active?'#fff':'#34577f';
      const count=button.querySelector('[data-role="tab-count"]');
      if(count)count.textContent=String(pendingRows[type]?.length||0);
    });
    renderPendingRows();
  }

  async function loadPendingPreinjertoData(){
    pendingRows={preinjerto_patron:[],preinjerto_variedad:[]};
    pendingLoadError=false;
    pendingUnverifiedRecordIds.clear();
    const today=riegoDiaDeHoy(),start=today-30;
    if(!await loadControlV2Index(true))throw Error('QC_INDEX_UNAVAILABLE');
    const firstQ=Math.max(0,controlV2QDeDia(start));
    const lastQ=controlV2QDeDia(today-1);
    const jobs=[];
    ['preinjerto_patron','preinjerto_variedad'].forEach(type=>{
      for(let q=firstQ;q<=lastQ;q++)jobs.push(loadControlChecksSlice(type,q,true));
    });
    const loaded=await Promise.all(jobs);
    if(loaded.some(ok=>!ok))throw Error('QC_SHARD_UNAVAILABLE');
    if(!partidasDBCargada&&typeof loadPartidasFromStorage==='function')await loadPartidasFromStorage();
    const relevant=controlChecksData.filter(record=>
      ['preinjerto_patron','preinjerto_variedad'].includes(record.tipo)&&
      Number.isInteger(record.dia)&&record.dia>=start&&record.dia<today
    );
    const groups=new Map();
    relevant.forEach(record=>{
      const key=claveEstadosQC(record.tipo,record.dia);
      if(!groups.has(key))groups.set(key,{type:record.tipo,day:record.dia,records:[]});
      groups.get(key).records.push(record);
    });
    const groupList=[...groups.values()];
    let nextGroup=0;
    const workers=Array.from({length:Math.min(3,groupList.length)},async()=>{
      while(nextGroup<groupList.length){
        const group=groupList[nextGroup++];
        const invalid=group.records.filter(record=>
          !/^[A-Za-z0-9_-]{1,180}$/.test(String(record.id))||
          !/^[A-Za-z0-9._-]{1,100}$/.test(String(record.partida||''))
        );
        const key=claveEstadosQC(group.type,group.day);
        if(invalid.length){
          pendingStatusFailures.set(key,`QC_STATUS_INVALID_REFERENCE:${invalid.slice(0,3).map(record=>record.partida||record.id).join(',')}`);
          continue;
        }
        const status=pendingOverlay?.querySelector('[data-role="pending-status"]');
        if(status)status.textContent=`Comprobando inspecciones ${nextGroup} de ${groupList.length}…`;
        const ok=await window.cargarEstadosQCDia(group.type,group.day,group.records);
        if(ok!==true&&!pendingStatusFailures.has(key))pendingStatusFailures.set(key,'QC_STATUS_UNAVAILABLE');
      }
    });
    await Promise.all(workers);
    pendingUnverifiedGroups=0;
    for(const group of groups.values()){
      const key=claveEstadosQC(group.type,group.day);
      const state=controlQCEstados.get(key);
      const signature=group.records.map(record=>record.id+':'+record.partida).sort().join('|');
      if(!state||state.signature!==signature||group.records.some(record=>
        !Object.prototype.hasOwnProperty.call(state.estados,record.id))){
        pendingUnverifiedGroups++;
        group.records.forEach(record=>pendingUnverifiedRecordIds.add(record.id));
        if(!pendingStatusFailures.has(key))pendingStatusFailures.set(key,'QC_STATUS_INCOMPLETE');
      }
    }
    pendingRows.preinjerto_patron=relevant.filter(record=>record.tipo==='preinjerto_patron'&&!window.controlLineaCompletada(record));
    pendingRows.preinjerto_variedad=relevant.filter(record=>record.tipo==='preinjerto_variedad'&&!window.controlLineaCompletada(record));
    pendingBadgeKnown=true;
    pendingBadgeCheckedAt=Date.now();
    updatePendingBadge();
  }

  function loadPendingPreinjerto(){
    if(pendingDataPromise)return pendingDataPromise;
    pendingDataPromise=loadPendingPreinjertoData().finally(()=>{pendingDataPromise=null;});
    return pendingDataPromise;
  }

  window.abrirPendientesPreinjerto=function(){
    if(pendingOverlay)return;
    pendingOverlay=document.createElement('div');
    pendingOverlay.id='qc-preinjerto-pendientes-overlay';
    pendingOverlay.setAttribute('role','presentation');
    pendingOverlay.style.cssText='position:fixed;inset:0;z-index:100500;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(13,31,51,.56);box-sizing:border-box';
    pendingOverlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="qc-preinjerto-pendientes-title" '+
      'style="display:flex;flex-direction:column;width:min(100%,560px);max-height:92vh;overflow:hidden;background:#fff;border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.25);font-family:inherit">'+
      '<header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px;border-bottom:1px solid #d9e4f1">'+
      '<div><h2 id="qc-preinjerto-pendientes-title" style="margin:0;color:#1558a0;font-size:18px">Pendientes de Preinjerto</h2>'+
      '<div style="margin-top:3px;color:#60758b;font-size:12px">Inspecciones anteriores sin completar · 30 días</div></div>'+
      '<button type="button" data-action="close" aria-label="Cerrar pendientes" style="width:38px;height:38px;border:0;border-radius:9px;background:#edf3fa;color:#1558a0;font-size:23px;cursor:pointer">×</button></header>'+
      '<div role="tablist" aria-label="Tipo de Preinjerto" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 14px 8px;padding:4px;border-radius:10px;background:#f1f5fa">'+
      '<button type="button" role="tab" data-pending-tab="preinjerto_patron" aria-selected="true" style="display:flex;justify-content:center;align-items:center;gap:7px;min-height:40px;border:0;border-radius:8px;background:#1558a0;color:#fff;font-weight:700;cursor:pointer">Patrón <span data-role="tab-count">…</span></button>'+
      '<button type="button" role="tab" data-pending-tab="preinjerto_variedad" aria-selected="false" style="display:flex;justify-content:center;align-items:center;gap:7px;min-height:40px;border:0;border-radius:8px;background:#f1f5fa;color:#34577f;font-weight:700;cursor:pointer">Variedad <span data-role="tab-count">…</span></button></div>'+
      '<div data-role="pending-status" aria-live="polite" style="padding:0 16px 7px;color:#60758b;font-size:11px">Actualizando ubicación y pendientes…</div>'+
      '<div data-role="pending-list" style="flex:1;min-height:100px;overflow:auto;padding:0 14px 14px"><div style="padding:24px;text-align:center;color:#60758b;font-size:13px">Cargando partidas…</div></div></section>';
    document.body.appendChild(pendingOverlay);
    pendingOverlay.querySelector('[data-action="close"]').addEventListener('click',closePendingOverlay);
    pendingOverlay.addEventListener('click',event=>{if(event.target===pendingOverlay)closePendingOverlay();});
    pendingOverlay.querySelectorAll('[data-pending-tab]').forEach(button=>
      button.addEventListener('click',()=>setPendingTab(button.dataset.pendingTab))
    );
    document.addEventListener('keydown',pendingEscapeHandler);
    loadPendingPreinjerto().then(()=>{
      if(!pendingOverlay)return;
      pendingOverlay.querySelector('[data-role="pending-status"]').textContent=pendingUnverifiedGroups
        ?`${pendingUnverifiedGroups} grupo(s) no se pudieron verificar; se muestran para no ocultar pendientes.`
        :'Ordenadas por invernadero y calle; la fecha de siembra se conserva.';
      setPendingTab(pendingTab);
    }).catch(error=>{
      if(!pendingOverlay)return;
      pendingLoadError=true;
      const message=String(error?.message||'');
      const status=pendingOverlay.querySelector('[data-role="pending-status"]');
      status.textContent=message.includes('QC_STATUS_UNAVAILABLE:QC_STATUS_HTTP_401')||message.includes('QC_STATUS_UNAVAILABLE:QC_STATUS_HTTP_403')||message.includes('QC_STATUS_UNAVAILABLE:LOGIN_REQUIRED')
        ?'La sesión no tiene permiso para consultar los estados QC. Vuelve a iniciar sesión.'
        :message.includes('QC_STATUS_UNAVAILABLE:QC_STATUS_HTTP_')
          ?'Firebase/Vercel rechazó la consulta de estados QC. Vuelve a intentarlo en unos segundos.'
          :message.startsWith('QC_STATUS_UNAVAILABLE')
            ?'No se pudo verificar una inspección en el servidor. Vuelve a intentarlo en unos segundos.'
        :message==='QC_INDEX_UNAVAILABLE'
          ?'No se pudo leer el índice de partidas QC.'
          :message==='QC_SHARD_UNAVAILABLE'
            ?'No se pudieron leer las partidas QC desde Firebase.'
            :'No se pudo actualizar la lista. Revisa la conexión e inténtalo de nuevo.';
      renderPendingRows();
      if(window.console&&console.error)console.error('[QC Preinjerto pendientes]',error);
    });
  };

  function pendingEscapeHandler(event){
    if(event.key==='Escape'&&pendingOverlay){
      document.removeEventListener('keydown',pendingEscapeHandler);
      closePendingOverlay();
    }
  }

  window.controlV2ShardDeItem=function(item){
    if(item&&keySet.has(item.tipo)){
      const q=controlV2QDeDia(item.dia);
      return q==null?null:controlV2ShardKey(item.tipo,q);
    }
    return oldShard?oldShard(item):null;
  };

  window.seleccionarSeccionControl=async function(section){
    if(!keySet.has(section))return oldSelect(section);
    if(currentUserRole==='CARGADOR'||section===controlSeccion)return;
    return navegarControlQC(async()=>{
      const offset=riegoQuincenaOffsetActual();
      const loaded=await loadControlSeccionSlice(section,offset,false);
      if(!loaded){avisarFalloCarga();return;}
      controlSeccion=section;
      controlQuincenaOffset=offset;
      controlDiaSel=riegoDiaDeHoy();
      renderControlContent(document.getElementById('control-overlay'));
    });
  };

  window.cambiarControlQuincena=async function(delta){
    if(!keySet.has(controlSeccion))return oldPeriod(delta);
    const next=Math.max(0,controlQuincenaOffset+delta);
    if(next===controlQuincenaOffset)return;
    return navegarControlQC(async()=>{
      const loaded=await loadControlSeccionSlice(controlSeccion,next,false);
      if(!loaded){avisarFalloCarga();return;}
      controlQuincenaOffset=next;
      controlDiaSel=riegoQuincenaDias(next)[0];
      renderControlContent(document.getElementById('control-overlay'));
    });
  };

  window.puedeCuantificarControl=function(record){
    if(record&&['preinjerto_patron','preinjerto_variedad'].includes(record.tipo))
      return ['ADMIN','TECNICO'].includes(currentUserRole);
    if(record&&keySet.has(record.tipo))return false;
    return oldQuantifiable?oldQuantifiable(record):false;
  };

  window.controlLineasFiltradasInv=function(lines,type){
    if(keySet.has(type))return lines;
    return oldFilterLines?oldFilterLines(lines,type):lines;
  };

  window.renderControlFiltroYAltaHTML=function(type){
    if(!keySet.has(type))return oldToolbar(...arguments);
    return '<div class="qc-preinjerto-toolbar" aria-label="Partidas de preinjerto por fecha de entrega"></div>'+
      '<div id="nuevo-control-form-wrap"></div>';
  };

  window.renderControlCardHTML=function(record,section){
    if(record&&['preinjerto_patron','preinjerto_variedad'].includes(record.tipo))return window.renderControlCardCompactHTML(record,section);
    if(!record||!keySet.has(record.tipo))return oldCard(record,section);
    const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
    const config=TYPES[record.tipo];
    const categories=config.categories.map(category=>{
      const options=category.options.map(([key,label])=>{
        const active=!!record[category.key]?.[key];
        return '<button type="button" onclick="toggleControlCheckOpcion(\''+esc(record.id)+'\',\''+category.key+'\',\''+key+'\')" '+
          'style="padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid transparent;background:'+
          (active?category.gradient:category.tint)+';color:'+(active?'#fff':'var(--text)')+'">'+(active?'✓ ':'')+label+'</button>';
      }).join('');
      return '<section class="qc-preinjerto-category" style="margin:0 0 11px">'+
        '<div style="font-size:10px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;display:flex;align-items:center;gap:5px">'+
        '<i class="ti '+category.icon+'" aria-hidden="true"></i>'+category.label+'</div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px">'+options+'</div></section>';
    }).join('');
    const plants=value=>{if(value==null||String(value).trim()==='')return '—';const formatted=typeof plantasVista==='function'?plantasVista(value):value;return esc(formatted==null||formatted===''?value:formatted)||'—';};
    const location=typeof controlQCInfoVisual==='function'
      ?controlQCInfoVisual(record):{inv:'—',calles:'—'};
    const status=window.controlLineaCompletada(record)?'<span class="qc-card-medido">✓ Completado</span>':'';
    const id='control-card-'+esc(record.id);
    return '<article id="'+id+'" class="qc-card-compact qc-preinjerto-card"><div class="qc-card-main">'+
      '<div class="qc-card-ident"><strong class="qc-card-partida">'+(esc(record.partida)||'Sin partida')+'</strong>'+status+
      '<div class="qc-card-cliente">'+(esc(record.cliente)||'Sin cliente')+'</div>'+
      (record.variedad?'<div class="qc-card-variedad">'+esc(record.variedad)+'</div>':'')+'</div>'+
      '<div class="qc-card-facts qc-card-facts-ordenado">'+
      '<span><i class="ti ti-box" aria-hidden="true"></i> Bandejas: <strong>'+(esc(record.numBandejas)||'—')+'</strong></span>'+
      '<span><i class="ti ti-building-warehouse" aria-hidden="true"></i> Invernadero: <strong>'+esc(location.inv)+'</strong></span>'+
      '<span><i class="ti ti-map-pin" aria-hidden="true"></i> Calle: <strong>'+esc(location.calles)+'</strong></span>'+
      '<span><i class="ti ti-calendar-event" aria-hidden="true"></i> F. siembra: <strong>'+(esc(record.fSiembra)||'—')+'</strong></span>'+
      '<span><i class="ti ti-calendar-check" aria-hidden="true"></i> F. entrega: <strong>'+(esc(record.fEntrega)||'—')+'</strong></span>'+
      '<span><i class="ti ti-seeding" aria-hidden="true"></i> Plantas sol./sem.: <strong>'+plants(record.plantasSol)+' / '+plants(record.plantasSem)+'</strong></span>'+
      '</div>'+categories+
      (record.observaciones?'<div class="qc-card-observaciones-historicas" style="white-space:pre-wrap;padding:8px 10px;color:var(--muted);font-size:11px"><strong>Observaciones históricas:</strong> '+esc(record.observaciones)+'</div>':'')+
      '</div></article>';
  };

  window.renderControlSeccionHTML=function(section){
    const rendered=oldRenderSection?oldRenderSection(section):'';
    return typeof rendered==='string'?rendered:'';
  };

  window.controlLineaCompletada=function(record){
    if(record&&['preinjerto_patron','preinjerto_variedad'].includes(record.tipo)){
      if(pendingUnverifiedRecordIds.has(record.id))return false;
      const entry=controlQCEstados.get(claveEstadosQC(record.tipo,record.dia));
      return entry?.estados?.[record.id]===true;
    }
    if(!record||!keySet.has(record.tipo))return oldComplete(record);
    return TYPES[record.tipo].categories.every(category=>
      record[category.key]&&Object.values(record[category.key]).some(Boolean));
  };

  window.controlLineaFinalizadaQC=function(record){
    if(keySet.has(record?.tipo))return window.controlLineaCompletada(record);
    return oldFinalized?oldFinalized(record):false;
  };

  window.aplicarControlCheckOpcion=async function(id,categoryKey,optionKey,value){
    const record=controlChecksData.find(item=>item.id===id);
    if(record&&keySet.has(record.tipo)&&
       (categoryKey==='plagas'||categoryKey==='enfermedades')&&value){
      record[categoryKey]=record[categoryKey]||{};
      Object.keys(record[categoryKey]).forEach(key=>{
        if(key!==optionKey&&(optionKey==='ok'||key==='ok'))record[categoryKey][key]=false;
      });
    }
    return oldApply(id,categoryKey,optionKey,value);
  };

  window.cargarEstadosQCDia=async function(type,day,records){
    if(!['preinjerto_patron','preinjerto_variedad'].includes(type)){
      if(keySet.has(type))return;
      return oldLoadStatuses(type,day,records);
    }
    if(!records?.length||!['ADMIN','TECNICO'].includes(currentUserRole))return false;
    const key=claveEstadosQC(type,day);
    const unique=new Map();
    records.forEach(record=>{
      if(/^[A-Za-z0-9_-]{1,180}$/.test(String(record.id))&&
         /^[A-Za-z0-9._-]{1,100}$/.test(String(record.partida||'')))unique.set(record.id,record);
    });
    const refs=Array.from(unique.values());
    if(!refs.length||refs.length!==records.length)return false;
    const signature=refs.map(record=>record.id+':'+record.partida).sort().join('|');
    const previous=controlQCEstados.get(key);
    if(previous?.signature===signature&&Date.now()-previous.at<120000)return true;
    if(controlQCEstadosCargando.has(key)){
      for(let attempt=0;attempt<300&&controlQCEstadosCargando.has(key);attempt++)
        await new Promise(resolve=>setTimeout(resolve,100));
      const finished=controlQCEstados.get(key);
      if(finished?.signature===signature)return true;
      if(controlQCEstadosCargando.has(key))return false;
    }
    controlQCEstadosCargando.add(key);
    const user=currentUser;
    try{
      if(!(await ensureFirebaseIdTokenFresh())||!firebaseIdToken)throw Error('LOGIN_REQUIRED');
      const states=Object.create(null);
      for(let i=0;i<refs.length;i+=60){
        const response=await fetch('/api/admin-qc-mediciones',{
          method:'POST',
          headers:{Authorization:'Bearer '+firebaseIdToken,'Content-Type':'application/json'},
          body:JSON.stringify({modo:'estados',tipo, dia,registros:refs.slice(i,i+60).map(({id,partida})=>({id,partida}))}),
          cache:'no-store'
        });
        if(!response.ok)throw Error('QC_STATUS_HTTP_'+response.status);
        const data=await response.json();
        if(!data.ok||data.tipo!==type||data.dia!==day||!data.estados)throw Error('QC_STATUS_INVALID');
        Object.entries(data.estados).forEach(([id,value])=>{states[id]=value===true;});
      }
      if(user!==currentUser)return false;
      const partidas=Object.create(null);
      refs.forEach(record=>{partidas[record.id]=record.partida;});
      controlQCEstados.set(key,{signature,estados:states,partidas,at:Date.now()});
      controlQCEstadosUltimoError.delete(key);
      pendingStatusFailures.delete(key);
      const overlay=document.getElementById('control-overlay');
      if(overlay&&overlay.style.display==='flex'&&controlSeccion===type&&controlDiaSel===day&&
         !document.querySelector('#qco-inline'))window.renderControlContent(overlay);
      return true;
    }catch(error){
      pendingStatusFailures.set(key,String(error?.message||'QC_STATUS_UNAVAILABLE'));
      controlQCEstadosUltimoError.set(key,Date.now());
      return false;
    }finally{
      controlQCEstadosCargando.delete(key);
    }
  };
})();

