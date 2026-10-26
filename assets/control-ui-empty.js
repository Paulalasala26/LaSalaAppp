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


/* QC 0.106 — Vista única de Túnel; sin excepción visual para Ginés.
 * No altera permisos, API, datos históricos ni las demás secciones de QC.
 */
(function(root){
 'use strict';
 const originalSeccion=root.renderControlSeccionHTML;
 const originalContenido=root.renderControlContent;
 if(typeof originalSeccion!=='function'||typeof originalContenido!=='function')return;
 root.renderControlSeccionHTML=function(sec){
   if(sec&&sec.key==='tunel'){
     if(controlVistaChecklist==='dashboard')controlVistaChecklist='lineas';
     return root.renderControlChecklistHTML(sec);
   }
   return originalSeccion(sec);
 };
 root.qc106ImprimirDia=function(){
   if(controlSeccion!=='tunel')return;
   const dia=controlDiaSel;
   const partidas=controlLineasFiltradasInv(
     controlChecksData.filter(function(c){return c.tipo==='tunel'&&c.dia===dia;}),'tunel'
   ).filter(function(c){
     return controlFiltroEstado==='todos'||
       (controlFiltroEstado==='completados'?controlLineaFinalizadaQC(c):!controlLineaFinalizadaQC(c));
   });
   if(!partidas.length){showToast('No hay inspecciones para imprimir.');return;}
   root.__controlListadoActual={titulo:'QC Túnel · '+riegoDiaLabelCorto(dia),lineas:partidas};
   imprimirListadoPartidasControl();
 };
 root.renderControlContent=function(overlay){
   const out=originalContenido(overlay);
   if(controlSeccion==='tunel'&&overlay){
     const repeated=overlay.querySelector('.control-ui-section-label');
     if(repeated)repeated.hidden=true;
     const print=overlay.querySelector('.qc-work-print');
     if(print){
       print.removeAttribute('onclick');
       print.onclick=root.qc106ImprimirDia;
     }
   }
   return out;
 };
})(window);
