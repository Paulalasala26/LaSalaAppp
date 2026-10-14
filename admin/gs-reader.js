/* GS: lectura PDF en memoria, sin escritura en Firebase. Formato GS probado: Salidas Previstas de Prendimiento. */
(function(root){"use strict";
const parsePages=function(pages){
  if(!Array.isArray(pages)||!pages.length)throw new Error("El PDF no contiene páginas legibles.");
  const first=(pages[0].items||[]).map(t=>String(t.str||"")).join(" ").replace(/\s+/g," ");
  if(!/Listado\s+Salidas\s+Previstas\s+de\s+Prendimiento/i.test(first)){
    throw new Error("Formato no reconocido: se espera «Listado Salidas Previstas de Prendimiento» de GS. No se importó nada.");
  }
  const fields=["tsi","numeroParte","numeroPartida","plantas","bandejas","localizacionGS","fechaEntrada","horaEntrada","fechaPrevistaSalida","observaciones"];
  const ends=[60,101,145,186,234,350,395,440,498,9999];
  const iso=(value)=>{
    const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value||"");
    if(!m)return null;
    const d=Number(m[1]),month=Number(m[2]),year=Number(m[3]);
    const check=new Date(Date.UTC(year,month-1,d));
    if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==d)return null;
    return `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  };
  const parts=[],errors=[],seen=new Set();
  for(let p=0;p<pages.length;p++){
    const page=pages[p],heightGroups=new Map();
    for(const t of (page.items||[])){
      if(!String(t.str||"").trim())continue;
      const y=Math.round(Number(t.y||0)/2)*2;
      if(!heightGroups.has(y))heightGroups.set(y,[]);
      heightGroups.get(y).push({x:Number(t.x),str:String(t.str).trim()});
    }
    const lines=[...heightGroups.entries()].sort((a,b)=>b[0]-a[0]);
    for(let li=0;li<lines.length;li++){
      const chunks=lines[li][1].sort((a,b)=>a.x-b.x), cols={};
      for(const f of fields)cols[f]=[];
      for(const token of chunks){
        const index=ends.findIndex(limit=>token.x<limit);
        if(index>=0)cols[fields[index]].push(token.str);
      }
      const get=k=>cols[k].join(" ").replace(/\s+/g," ").trim();
      const partida=get("numeroPartida"),parte=get("numeroParte"),tsi=get("tsi");
      if(!/^\d{2}[A-Z]{1,2}\d{4,5}$/.test(partida))continue;
      const plantasRaw=get("plantas"),bandejasRaw=get("bandejas");
      const plantas=Number(plantasRaw.replace(/,/g,""));
      const bandejas=Number(bandejasRaw.replace(/,/g,""));
      const fechaEntrada=iso(get("fechaEntrada")),fechaPrevistaSalida=iso(get("fechaPrevistaSalida"));
      if(!/^\d{6,10}$/.test(parte)||!/^[A-Z]{2}\d{2}$/.test(tsi)||
         !/^\d{1,3}(?:,\d{3})*$|^\d+$/.test(plantasRaw)||!Number.isSafeInteger(plantas)||
         !/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(bandejasRaw)||
         !Number.isFinite(bandejas)||bandejas<0||!fechaEntrada||!fechaPrevistaSalida||
         !/^\d{2}:\d{2}$/.test(get("horaEntrada"))){
        errors.push(`Página ${p+1}, fila ${li+1}: datos incompletos o inválidos de ${partida}.`);
        continue;
      }
      const key=`${parte}|${partida}`;
      if(seen.has(key)){errors.push(`Página ${p+1}: parte duplicado ${parte}, partida ${partida}.`);continue}
      seen.add(key);
      parts.push({numeroParte:parte,numeroPartida:partida,tsi,
        plantasEnParte:plantas,bandejasEnParte:bandejas,
        localizacionGS:get("localizacionGS"),
        fechaEntrada,horaEntrada:get("horaEntrada"),fechaPrevistaSalida,
        observaciones:get("observaciones")||null,paginaPDF:p+1});
    }
  }
  if(!parts.length)throw new Error("No se han reconocido partes válidos. Comprueba el formato de las columnas GS; no se importó nada.");
  const grupos=new Map();
  for(const part of parts){
    if(!grupos.has(part.numeroPartida))grupos.set(part.numeroPartida,[]);
    grupos.get(part.numeroPartida).push(part);
  }
  return {partes:parts,partidas:[...grupos].sort(([a],[b])=>a.localeCompare(b,"es"))
    .map(([numeroPartida,partes])=>({numeroPartida,partes})),
    resumen:{partes:parts.length,partidas:grupos.size,
      plantasEnPartes:parts.reduce((n,r)=>n+r.plantasEnParte,0),
      bandejasEnPartes:parts.reduce((n,r)=>n+r.bandejasEnParte,0)},errores:errors};
};
root.GSReader=Object.freeze({parsePages});
})(window);
