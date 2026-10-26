'use strict';
// Pantalla vacía QC sin modificar el motor de Túnel/Carga ni sus formularios.
(function(root){
  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function render(opts){
    if(!opts||!['tunel','carga'].includes(opts.tipo)||typeof opts.dateNavHTML!=='string')return '';
    const tunel=opts.tipo==='tunel';
    const selected=Number(opts.selected);
    const addAction=tunel?"mostrarFormNuevoControlCheck('tunel')":"mostrarFormNuevoControlCargaCheck()";
    const canAdd=opts.canAdd===true;
    const hideAddButton=opts.hideAddButton===true;
    const formInToolbar=opts.formInToolbar===true;
    const pdfAction="handleControlPdfInput(this,'"+opts.tipo+"',"+selected+")";
    const more=[
      ...(canAdd?['<label class="qc-empty-secondary"><i class="ti ti-file-type-pdf"></i> Insertar PDF<input type="file" accept="application/pdf" onchange="'+pdfAction+'"></label>']:[])
    ];
    if(tunel){
      more.push('<label class="qc-empty-secondary"><i class="ti ti-file-upload"></i> Añadir extensiones<input type="file" accept="application/pdf" onchange="handleExtensionesPdfInput(this)"></label>');
      more.push('<button type="button" class="qc-empty-secondary" onclick="mostrarComprobarExtensiones()">Comprobar extensiones</button>');
    }
    const pending=Number(opts.pending)||0;
    const sync=pending>0?
      '<button type="button" class="qc-empty-secondary" onclick="sincronizarControlManual()"><i class="ti ti-refresh"></i> Sincronizar ('+pending+')</button>':'';
    const pdfUrl=typeof opts.pdfUrl==='string'&&/^data:application\/pdf;base64,/i.test(opts.pdfUrl)?opts.pdfUrl:'';
    const pdf=opts.pdfNombre?
      '<div class="qc-empty-file">PDF del día: '+esc(opts.pdfNombre)+
      (pdfUrl?' · <a href="'+esc(pdfUrl)+'" target="_blank" rel="noopener noreferrer">Ver PDF</a>':'')+'</div>':'';
    return '<div class="qc-empty-screen">'+
      '<h2 class="qc-empty-title">'+esc(opts.titulo)+'</h2>'+
      opts.dateNavHTML+
      '<div class="qc-empty-panel" role="status">'+
        '<i class="ti ti-clipboard-list" aria-hidden="true"></i>'+
        '<strong>Sin partidas para este día</strong>'+
        (canAdd&&!hideAddButton?'<p>Elige otra fecha o añade una línea.</p>'+
        '<button type="button" class="qc-empty-primary" onclick="'+addAction+'"><i class="ti ti-plus"></i> Añadir línea</button>':'')+
      '</div>'+
      (formInToolbar?'':'<div id="nuevo-control-form-wrap"></div>')+
      '<div class="qc-empty-actions">'+sync+'</div>'+
      (pending>0?'<div class="qc-empty-pending">Hay '+pending+' cambio(s) pendiente(s) de sincronizar.</div>':'')+
      '<details class="qc-empty-more"><summary>Más opciones</summary><div class="qc-empty-options">'+more.join('')+'</div>'+pdf+'</details>'+
    '</div>';
  }
  root.QCEmptyState=Object.freeze({render:render});
})(window);


/* QC 0.106 — Vista operativa Túnel. Carga conserva de momento su comportamiento.
 * Se reutilizan el backend, la edición, importadores y formularios QC existentes.
 * La ruta especial por usuario (Ginés) deja de intervenir en QC Túnel.
 */
(function(root){
  'use strict';
  const baseSeccion=root.renderControlSeccionHTML;
  const baseChecklist=root.renderControlChecklistHTML;
  const baseFecha=root.renderControlQCDateNav;
  const baseContenido=root.renderControlContent;
  if(typeof baseSeccion!=='function'||typeof baseChecklist!=='function'||
     typeof baseFecha!=='function'||typeof baseContenido!=='function')return;

  function iso(d){
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function fechaParaDia(dia){return iso(riegoDiaToDate(dia));}
  function diaParaFecha(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
    const p=value.split('-').map(Number);
    const d=new Date(p[0],p[1]-1,p[2],12),a=riegoDiaToDate(15);
    a.setHours(12,0,0,0);
    if(d.getFullYear()!==p[0]||d.getMonth()!==p[1]-1||d.getDate()!==p[2])return null;
    const dia=15+Math.round((d.getTime()-a.getTime())/86400000);
    return Number.isInteger(dia)&&dia>=15?dia:null;
  }
  root.qc106ElegirFecha=async function(value){
    const dia=diaParaFecha(value);
    if(dia===null){showToast('Selecciona una fecha válida.');return;}
    if(dia===controlDiaSel)return;
    const periodo=Math.floor((dia-15)/14);
    await navegarControlQC(async function(){
      const ok=await loadControlSeccionSlice('tunel',periodo,false);
      if(!ok){avisarFalloCarga();return;}
      controlQuincenaOffset=periodo;
      controlDiaSel=dia;
      renderControlContent(document.getElementById('control-overlay'));
    });
  };
  root.qc106MoverFecha=function(delta){
    const dia=Math.max(15,(Number(controlDiaSel)||riegoDiaDeHoy())+Number(delta||0));
    if(dia===controlDiaSel)return;
    return root.qc106ElegirFecha(fechaParaDia(dia));
  };
  root.qc106Imprimir=function(){
    if(controlSeccion!=='tunel')return;
    const dia=controlDiaSel;
    const rows=controlLineasFiltradasInv(
      controlChecksData.filter(function(c){return c.tipo==='tunel'&&c.dia===dia;}),'tunel'
    ).filter(function(c){
      return controlFiltroEstado==='todos'||
        (controlFiltroEstado==='completados'?controlLineaFinalizadaQC(c):!controlLineaFinalizadaQC(c));
    });
    if(!rows.length){showToast('No hay inspecciones para imprimir.');return;}
    root.__controlListadoActual={titulo:'QC Túnel · '+riegoDiaLabelCorto(dia),lineas:rows};
    imprimirListadoPartidasControl();
  };
  root.renderControlQCDateNav=function(offset,selected,mode){
    if(controlSeccion!=='tunel')return baseFecha(offset,selected,mode);
    const dia=Number.isInteger(selected)?selected:riegoDiaDeHoy();
    return '<div class="qc106-date-selector" role="group" aria-label="Seleccionar fecha de trabajo">'+
      '<button type="button" aria-label="Día anterior" onclick="qc106MoverFecha(-1)"'+(dia<=15?' disabled':'')+'><i class="ti ti-chevron-left"></i></button>'+
      '<input type="date" aria-label="Fecha de trabajo" min="'+fechaParaDia(15)+'" value="'+fechaParaDia(dia)+'" onchange="qc106ElegirFecha(this.value)">'+
      '<button type="button" aria-label="Día siguiente" onclick="qc106MoverFecha(1)"><i class="ti ti-chevron-right"></i></button>'+
      '</div>';
  };
  // El tipo de vista no depende del usuario; no se modifica la matriz de permisos.
  root.renderControlSeccionHTML=function(seccion){
    if(seccion&&seccion.key==='tunel')return root.renderControlChecklistHTML(seccion);
    return baseSeccion(seccion);
  };
  function panel(titulo,clase){
    const p=document.createElement('section');
    p.className='qc106-panel '+(clase||'');
    const h=document.createElement('h3');
    h.className='qc106-panel-title';
    h.textContent=titulo;
    p.appendChild(h);
    return p;
  }
  function mover(src,selector,dest){
    const n=src.querySelector(selector);
    if(n)dest.appendChild(n);
    return n;
  }
  function componer(html){
    const tmp=document.createElement('div');
    tmp.innerHTML=html;
    const old=tmp.querySelector('.qc-list-screen, .qc-empty-screen');
    if(!old)return html;
    const result=document.createElement('div');
    result.className='qc106-view';
    const fecha=panel('Fecha de trabajo','qc106-fecha');
    const trabajo=panel('Operativa del día','qc106-operativa');
    const inspecciones=panel('Inspecciones del día','qc106-inspecciones');
    mover(old,'.qc106-date-selector',fecha);
    mover(old,'.qc-alta-toolbar',trabajo);
    mover(old,'#nuevo-control-form-wrap',trabajo);
    mover(old,'.qc-list-tools',trabajo);
    mover(old,'.qc-list-sync',trabajo);
    mover(old,'.qc-empty-actions',trabajo);
    mover(old,'.qc-empty-pending',trabajo);
    const more=mover(old,'.qc-list-more, .qc-empty-more',trabajo);
    if(more){
      more.querySelectorAll('[onclick^="exportarControlCSV"],[onclick^="cambiarControlVistaChecklist"]').forEach(function(b){b.remove();});
      more.querySelectorAll('button').forEach(function(b){
        if(b.textContent.trim()==='Dashboard del día'||b.textContent.includes('Exportar CSV'))b.remove();
      });
      more.querySelectorAll('button[onclick="sincronizarControlManual()"]').forEach(function(b){
        b.title='Reintentar cambios pendientes de la cola general; no envía fotografías QC';
      });
    }
    const cards=mover(old,'.qc-list-cards, .qc-list-none, .qc-empty-panel',inspecciones);
    if(!cards){
      const empty=document.createElement('p');
      empty.textContent='No hay inspecciones para este día.';
      inspecciones.appendChild(empty);
    }
    result.appendChild(fecha);
    result.appendChild(trabajo);
    result.appendChild(inspecciones);
    return result.outerHTML;
  }
  root.renderControlChecklistHTML=function(seccion){
    if(!seccion||seccion.key!=='tunel')return baseChecklist(seccion);
    // El dashboard heredado no debe reaparecer aunque se visite desde otra sección.
    if(controlVistaChecklist==='dashboard')controlVistaChecklist='lineas';
    return componer(baseChecklist(seccion));
  };
  root.renderControlContent=function(overlay){
    const out=baseContenido(overlay);
    if(controlSeccion==='tunel'&&overlay){
      const actions=overlay.querySelector('.control-ui-header-right');
      const close=actions&&actions.querySelector('.control-ui-close');
      if(actions&&close&&!actions.querySelector('.qc106-print')){
        const b=document.createElement('button');
        b.type='button';
        b.className='qc106-print';
        b.title='Imprimir inspecciones del día';
        b.setAttribute('aria-label','Imprimir inspecciones del día');
        b.innerHTML='<i class="ti ti-printer" aria-hidden="true"></i>';
        b.onclick=root.qc106Imprimir;
        actions.insertBefore(b,close);
      }
      // El nombre del apartado ya está en la pestaña seleccionada.
      const duplicated=overlay.querySelector('.control-ui-section-label');
      if(duplicated)duplicated.textContent='';
    }
    return out;
  };
})(window);
