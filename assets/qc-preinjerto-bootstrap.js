'use strict';
// Controles visuales de Preinjerto en TEST.
// Usa el checklist existente, sin importar todavía registros desde GS.
(function(){
  const TYPES={
    preinjerto_variedad:{
      key:'preinjerto_variedad',label:'QC Preinjerto Variedad',icon:'ti-seeding',
      color:'linear-gradient(135deg,#2e7d32,#66bb6a)',
      categories:[
        {key:'color',label:'Color',icon:'ti-palette',gradient:'linear-gradient(135deg,#7b5cf0,#5c8df0)',tint:'#efeafd',options:[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]},
        {key:'tamano',label:'Tamaño',icon:'ti-ruler-2',gradient:'linear-gradient(135deg,#5c8df0,#3fc6b0)',tint:'#e8f2fd',options:[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]},
        {key:'grosor',label:'Grosor',icon:'ti-arrows-horizontal',gradient:'linear-gradient(135deg,#00838f,#4dd0e1)',tint:'#e0f7fa',options:[['fino','Fino'],['ok','OK'],['grueso','Grueso']]},
        {key:'firmeza',label:'Firmeza',icon:'ti-hand-finger',gradient:'linear-gradient(135deg,#6a1b9a,#ab47bc)',tint:'#f3e5f5',options:[['ok','OK'],['duro','Duro'],['tierno','Tierno']]},
        {key:'plagas',label:'Plagas',icon:'ti-bug',gradient:'linear-gradient(135deg,#f5a35c,#f0715c)',tint:'#fdece5',options:[['ok','OK'],['tuta','Tuta'],['minador','Minador'],['pulgon','Pulgón'],['oruga','Oruga'],['trips','Trips']]},
        {key:'enfermedades',label:'Enfermedades',icon:'ti-virus',gradient:'linear-gradient(135deg,#ad1457,#ec407a)',tint:'#fce4ec',options:[['ok','OK'],['alternaria','Alternaria'],['mildiu','Mildiu'],['oidio','Oídio'],['botrytis','Botrytis'],['didymella','Didymella']]}
      ]
    },
    preinjerto_patron:{
      key:'preinjerto_patron',label:'QC Preinjerto Patrón',icon:'ti-plant-2',
      color:'linear-gradient(135deg,#558b2f,#aed581)',
      categories:[
        {key:'grosor',label:'Grosor',icon:'ti-arrows-horizontal',gradient:'linear-gradient(135deg,#00838f,#4dd0e1)',tint:'#e0f7fa',options:[['fino','Fino'],['ok','OK'],['grueso','Grueso']]},
        {key:'firmeza',label:'Firmeza',icon:'ti-hand-finger',gradient:'linear-gradient(135deg,#6a1b9a,#ab47bc)',tint:'#f3e5f5',options:[['ok','OK'],['duro','Duro'],['tierno','Tierno']]},
        {key:'segado',label:'Segado',icon:'ti-scissors',gradient:'linear-gradient(135deg,#d84315,#ff8a65)',tint:'#fbe9e7',options:[['segado','Segado'],['noSegado','No segado']]},
        {key:'plagas',label:'Plagas',icon:'ti-bug',gradient:'linear-gradient(135deg,#f5a35c,#f0715c)',tint:'#fdece5',options:[['ok','OK'],['tuta','Tuta'],['minador','Minador'],['pulgon','Pulgón'],['oruga','Oruga'],['trips','Trips']]},
        {key:'enfermedades',label:'Enfermedades',icon:'ti-virus',gradient:'linear-gradient(135deg,#ad1457,#ec407a)',tint:'#fce4ec',options:[['ok','OK'],['alternaria','Alternaria'],['mildiu','Mildiu'],['oidio','Oídio'],['botrytis','Botrytis'],['didymella','Didymella']]},
        {key:'raices',label:'Raíces',icon:'ti-plant-2',gradient:'linear-gradient(135deg,#c47f00,#e0a530)',tint:'#fbf1e0',options:[['pocaRaiz','Poca raíz'],['ok','OK'],['raizVieja','Raíz vieja']]}
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
    if(record&&['preinjerto_patron','preinjerto_variedad'].includes(record.tipo))return oldCard(record,section);
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
      '<label class="qc-card-observaciones">Observaciones<input type="text" value="'+esc(record.observaciones)+'" placeholder="Sin observaciones" onchange="guardarControlObservaciones(\''+esc(record.id)+'\',this.value)" /></label>'+
      '</div></article>';
  };

  window.renderControlSeccionHTML=function(section){
    const rendered=oldRenderSection?oldRenderSection(section):'';
    return typeof rendered==='string'?rendered:'';
  };

  window.controlLineaCompletada=function(record){
    if(record&&['preinjerto_patron','preinjerto_variedad'].includes(record.tipo)){
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
    if(!records?.length||!['ADMIN','TECNICO'].includes(currentUserRole))return;
    const key=claveEstadosQC(type,day);
    if(controlQCEstadosCargando.has(key))return;
    const unique=new Map();
    records.forEach(record=>{
      if(/^[A-Za-z0-9_-]{1,180}$/.test(String(record.id))&&
         /^[A-Za-z0-9._-]{1,100}$/.test(String(record.partida||'')))unique.set(record.id,record);
    });
    const refs=Array.from(unique.values());
    if(!refs.length)return;
    const signature=refs.map(record=>record.id+':'+record.partida).sort().join('|');
    const previous=controlQCEstados.get(key);
    if(previous?.signature===signature&&Date.now()-previous.at<120000)return;
    if(Date.now()-(controlQCEstadosUltimoError.get(key)||0)<30000)return;
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
        if(!response.ok)throw Error('QC_STATUS_UNAVAILABLE');
        const data=await response.json();
        if(!data.ok||data.tipo!==type||data.dia!==day||!data.estados)throw Error('QC_STATUS_INVALID');
        Object.entries(data.estados).forEach(([id,value])=>{states[id]=value===true;});
      }
      if(user!==currentUser)return;
      const partidas=Object.create(null);
      refs.forEach(record=>{partidas[record.id]=record.partida;});
      controlQCEstados.set(key,{signature,estados:states,partidas,at:Date.now()});
      controlQCEstadosUltimoError.delete(key);
      const overlay=document.getElementById('control-overlay');
      if(overlay&&overlay.style.display==='flex'&&controlSeccion===type&&controlDiaSel===day&&
         !document.querySelector('#qco-inline'))window.renderControlContent(overlay);
    }catch(_){
      controlQCEstadosUltimoError.set(key,Date.now());
    }finally{
      controlQCEstadosCargando.delete(key);
    }
  };
})();

