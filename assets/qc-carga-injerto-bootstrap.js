'use strict';
// Añade QC Carga Injerto al Control integrado en index.html.
// El array y las funciones principales son globales del script clásico de la app.
(function(){
  const TYPE='carga_injerto';
  const originalSection=window.seleccionarSeccionControl;
  const originalChangePeriod=window.cambiarControlQuincena;
  const originalRenderSummary=window.renderControlResumenHTML;
  const originalRenderContent=window.renderControlContent;
  const originalRenderCard=window.renderControlCardHTML;
  const originalFilterToolbar=window.renderControlFiltroYAltaHTML;
  const originalFilterLines=window.controlLineasFiltradasInv;
  const originalQuantifiable=window.puedeCuantificarControl;
  const originalShardOfItem=window.controlV2ShardDeItem;
  const originalLoadPdf=window.cargarControlPdfDia;
  const originalMarkMeasured=window.marcarControlQCMedido;
  const originalLoadStatuses=window.cargarEstadosQCDia;

  if(!Array.isArray(CONTROL_SECCIONES)||!CONTROL_SECCIONES.some(s=>s.key===TYPE)){
    const index=CONTROL_SECCIONES.findIndex(s=>s.key==='carga');
    const section={key:TYPE,label:'QC Carga Injerto',icon:'ti-seedling',
      color:'linear-gradient(135deg,#7b5cf0,#3fa864)',conCheck:true};
    CONTROL_SECCIONES.splice(index<0?CONTROL_SECCIONES.length:index+1,0,section);
  }

  // En el menú de Control de Calidad dejamos solo controles operativos.
  for(let i=CONTROL_SECCIONES.length-1;i>=0;i--){
    if(!['tunel','carga',TYPE].includes(CONTROL_SECCIONES[i].key))CONTROL_SECCIONES.splice(i,1);
  }

  function normalizarRegistrosInjerto(){
    controlChecksData.forEach(record=>{
      if(record?.tipo!==TYPE)return;
      const inv=String(record.invId??'').trim();
      const desde=String(record.calleDesde??'').trim();
      const hasta=String(record.calleHasta??'').trim();
      if(/^\\d{1,2}$/.test(inv)&&/^\\d{1,3}$/.test(desde)&&/^\\d{1,3}$/.test(hasta))
        record.invernadero=inv+'-'+desde+'-'+hasta;
    });
  }

  window.controlV2ShardDeItem=function(item){
    if(item&&item.tipo===TYPE){
      const q=controlV2QDeDia(item.dia);
      return q==null?null:controlV2ShardKey(item.tipo,q);
    }
    return originalShardOfItem?originalShardOfItem(item):null;
  };

  window.puedeCuantificarControl=function(record){
    return !!record&&(record.tipo===TYPE
      ? ['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole)
      : originalQuantifiable?originalQuantifiable(record):false)&&
      /^[A-Za-z0-9_-]{1,180}$/.test(String(record.id||''));
  };

  window.controlLineasFiltradasInv=function(lines,type){
    return originalFilterLines?originalFilterLines(lines,type===TYPE?'carga':type):lines;
  };

  window.renderControlFiltroYAltaHTML=function(type,day,wizard){
    if(type!==TYPE)return originalFilterToolbar(type,day,wizard);
    return '<div class="qc-alta-toolbar" style="display:flex;align-items:flex-end;gap:8px;min-width:0;margin-bottom:11px">'+
      '<div style="flex:1 1 0;min-width:0">'+renderControlFiltroInvHTML('carga')+'</div></div>'+
      '<div id="nuevo-control-form-wrap"></div>';
  };

  window.renderControlCardHTML=function(record,section){
    if(record?.tipo!==TYPE)return originalRenderCard(record,section);
    const e=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[ch]));
    return '<article id="control-card-'+e(record.id)+'" class="qc-card-compact">'+
      '<div class="qc-card-main">'+renderControlIdentidadQC(record)+
      renderControlDatosQC(record)+renderControlAbrirInspeccionHTML(record)+'</div>'+
      '<details class="qc-card-more"><summary>Detalles y acciones</summary>'+
      '<div class="qc-card-details"><div class="qc-card-actionbar">'+
      '<button type="button" onclick="mostrarEditarControlCargaInjerto(\''+e(record.id)+'\')"><i class="ti ti-pencil" aria-hidden="true"></i> Editar partida</button>'+
      '<button type="button" class="qc-card-danger qc-card-trash" onclick="eliminarControlCheck(\''+e(record.id)+'\')" title="Eliminar registro de partida" aria-label="Eliminar registro de partida"><i class="ti ti-trash" aria-hidden="true"></i></button>'+
      '</div></div></details></article>';
  };

  window.cargarControlPdfDia=function(type,day){
    if(type===TYPE)return;
    if(originalLoadPdf)return originalLoadPdf(type,day);
  };

  window.seleccionarSeccionControl=async function(section){
    if(section!==TYPE)return originalSection(section);
    if(section===controlSeccion)return;
    return navegarControlQC(async()=>{
      const offset=riegoQuincenaOffsetActual();
      const loaded=await loadControlSeccionSlice(TYPE,offset,false);
      if(!loaded){avisarFalloCarga();return;}
      controlSeccion=TYPE;
      controlQuincenaOffset=offset;
      controlDiaSel=riegoDiaDeHoy();
      renderControlContent(document.getElementById('control-overlay'));
    });
  };

  window.cambiarControlQuincena=async function(delta){
    if(controlSeccion!==TYPE)return originalChangePeriod(delta);
    const next=Math.max(0,controlQuincenaOffset+delta);
    if(next===controlQuincenaOffset)return;
    return navegarControlQC(async()=>{
      const loaded=await loadControlSeccionSlice(TYPE,next,false);
      if(!loaded){avisarFalloCarga();return;}
      controlQuincenaOffset=next;
      controlDiaSel=riegoQuincenaDias(next)[0];
      renderControlContent(document.getElementById('control-overlay'));
    });
  };

  window.renderControlResumenHTML=function(){
    const html=originalRenderSummary();
    if(currentUserRole!=='CARGADOR'||html.includes('QC Carga Injerto'))return html;
    const total=controlV2TotalTipo(TYPE);
    const count=total==null?controlChecksData.filter(item=>item.tipo===TYPE).length:total;
    const card=document.createElement('div');
    card.style.cssText='cursor:pointer;background:linear-gradient(120deg,#2b6fae,#3c80c2 55%,#5b9bd5);color:#fff;border:1px solid transparent;border-radius:14px;padding:.65rem .9rem;box-shadow:0 6px 18px rgba(0,0,0,.12)';
    card.innerHTML='<div style="display:flex;align-items:center;gap:8px;min-height:28px"><i class="ti ti-seedling" style="font-size:19px;opacity:.9;flex-shrink:0"></i><div style="font-size:13px;font-weight:700;line-height:1.25">QC Carga Injerto</div></div><div style="font-size:11px;opacity:.9;margin-top:3px;line-height:1.25"><strong style="font-size:16px">'+count+'</strong> '+(count===1?'línea registrada':'líneas registradas')+'</div>';
    card.addEventListener('click',()=>window.seleccionarSeccionControl(TYPE));
    const holder=document.createElement('div');
    holder.innerHTML=html;
    const normal=Array.from(holder.children).find(item=>item.textContent.includes('QC Carga normal'));
    if(normal)normal.insertAdjacentElement('afterend',card);else holder.appendChild(card);
    return holder.innerHTML;
  };

  window.renderControlContent=function(overlay){
    normalizarRegistrosInjerto();
    return originalRenderContent(overlay);
  };

  window.marcarControlQCMedido=function(ref){
    if(ref?.tipo!==TYPE)return originalMarkMeasured(ref);
    if(!ref)return;
    const key=claveEstadosQC(ref.tipo,ref.dia),entry=controlQCEstados.get(key);
    if(entry){entry.estados[ref.id]=true;entry.partidas[ref.id]=ref.partida;entry.at=Date.now();}
    const overlay=document.getElementById('control-overlay');
    if(overlay&&controlSeccion===TYPE&&controlDiaSel===ref.dia&&!document.querySelector('#qco-inline'))
      window.renderControlContent(overlay);
  };

  window.cargarEstadosQCDia=async function(type,day,records){
    if(type!==TYPE||currentUserRole!=='CARGADOR')return originalLoadStatuses(type,day,records);
    if(!records?.length)return;
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
      if(overlay&&overlay.style.display==='flex'&&controlSeccion===TYPE&&controlDiaSel===day&&
         !document.querySelector('#qco-inline'))window.renderControlContent(overlay);
    }catch(_){
      controlQCEstadosUltimoError.set(key,Date.now());
    }finally{
      controlQCEstadosCargando.delete(key);
    }
  };
})();
