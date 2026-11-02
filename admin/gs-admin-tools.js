/* Backoffice GS: herramientas de consulta y CSV en memoria; ninguna petición ni escritura remota. */
(function(root){'use strict';
  const upper=value=>String(value??'').trim().toLocaleUpperCase('es');
  function filterPartidas(partidas,term){
    if(!Array.isArray(partidas))throw new Error('Listado GS no válido.');
    const query=upper(term);
    if(!query)return partidas.slice();
    return partidas.filter(item=>
      upper(item.numeroPartida).includes(query)||
      (Array.isArray(item.partes)&&item.partes.some(p=>
        upper(p.numeroParte).includes(query)||upper(p.tsi).includes(query)))
    );
  }
  // Comillas, BOM y escape de fórmulas: el CSV es una copia del PDF, nunca un maestro.
  function csvPartes(partidas){
    if(!Array.isArray(partidas))throw new Error('Listado GS no válido.');
    const heads=['Nº partida','Nº parte','TSI','Plantas en parte','Bandejas en parte',
      'Localización GS','Fecha entrada','Hora entrada','Salida prevista','Observaciones','Página PDF'];
    const cell=value=>{
      let text=String(value??'').replace(/[\r\n]+/g,' ').trim();
      if(/^[=+\-@\t]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const rows=[heads];
    for(const partida of partidas){
      if(!Array.isArray(partida.partes))throw new Error('Partes GS no válidos.');
      for(const p of partida.partes)rows.push([
        partida.numeroPartida,p.numeroParte,p.tsi,p.plantasEnParte,p.bandejasEnParte,
        p.localizacionGS,p.fechaEntrada,p.horaEntrada,p.fechaPrevistaSalida,
        p.observaciones,p.paginaPDF
      ]);
    }
    return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n';
  }
  root.GSAdminTools=Object.freeze({filterPartidas,csvPartes});
})(window);
