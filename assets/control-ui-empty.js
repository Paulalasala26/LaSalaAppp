'use strict';
// Pantalla vacía QC sin modificar el motor de Túnel/Carga ni sus formularios.
(function(root){
  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function render(opts){
    if(!opts||!['tunel','carga'].includes(opts.tipo)||!Array.isArray(opts.dias))return '';
    const tunel=opts.tipo==='tunel';
    const selected=Number(opts.selected);
    const choices=opts.dias.map(function(d){
      const id=Number(d.id);
      if(!Number.isInteger(id))return '';
      return '<option value="'+id+'"'+(selected===id?' selected':'')+'>'+esc(d.label)+'</option>';
    }).join('');
    const addAction=tunel?"mostrarFormNuevoControlCheck('tunel')":"mostrarFormNuevoControlCargaCheck()";
    const pdfAction="handleControlPdfInput(this,'"+opts.tipo+"',"+selected+")";
    const more=[
      '<label class="qc-empty-secondary"><i class="ti ti-file-type-pdf"></i> Insertar PDF<input type="file" accept="application/pdf" onchange="'+pdfAction+'"></label>'
    ];
    if(tunel){
      more.push('<label class="qc-empty-secondary"><i class="ti ti-file-upload"></i> Añadir extensiones<input type="file" accept="application/pdf" onchange="handleExtensionesPdfInput(this)"></label>');
      more.push('<button type="button" class="qc-empty-secondary" onclick="mostrarComprobarExtensiones()">Comprobar extensiones</button>');
    }
    const pending=Number(opts.pending)||0;
    const sync=pending>0?
      '<button type="button" class="qc-empty-secondary" onclick="sincronizarControlManual()"><i class="ti ti-refresh"></i> Sincronizar ('+pending+')</button>':'';
    const pdf=opts.pdfNombre?
      '<div class="qc-empty-file">PDF del día: '+esc(opts.pdfNombre)+'</div>':'';
    return '<div class="qc-empty-screen">'+
      '<h2 class="qc-empty-title">'+esc(opts.titulo)+'</h2>'+
      '<div class="qc-empty-date">'+
        '<span class="qc-empty-period">'+esc(opts.periodo)+'</span>'+
        '<button type="button" onclick="cambiarControlQuincena(-1)" aria-label="Quincena anterior"'+(opts.prevDisabled?' disabled':'')+'>&lsaquo;</button>'+
        '<label class="qc-empty-daylabel" for="qc-empty-date-select">Día</label>'+
        '<select id="qc-empty-date-select" onchange="cambiarControlDia(parseInt(this.value,10))">'+choices+'</select>'+
        '<button type="button" onclick="cambiarControlQuincena(1)" aria-label="Quincena siguiente">&rsaquo;</button>'+
      '</div>'+
      '<div class="qc-empty-panel" role="status">'+
        '<i class="ti ti-clipboard-list" aria-hidden="true"></i>'+
        '<strong>Sin partidas para este día</strong>'+
        '<p>Elige otra fecha o añade una línea.</p>'+
        '<button type="button" class="qc-empty-primary" onclick="'+addAction+'"><i class="ti ti-plus"></i> Añadir línea</button>'+
      '</div>'+
      '<div id="nuevo-control-form-wrap"></div>'+
      '<div class="qc-empty-actions">'+sync+'</div>'+
      (pending>0?'<div class="qc-empty-pending">Hay '+pending+' cambio(s) pendiente(s) de sincronizar.</div>':'')+
      '<details class="qc-empty-more"><summary>Más opciones</summary><div class="qc-empty-options">'+more.join('')+'</div>'+pdf+'</details>'+
    '</div>';
  }
  root.QCEmptyState=Object.freeze({render:render});
})(window);
