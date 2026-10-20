'use strict';
// Indicadores informativos por registro QC: NUNCA decide ni bloquea una partida.
// Solo porcentajes de cada opción respecto a las bandejas inspeccionadas.
// No sumar porcentajes: las bandejas con varios defectos pueden solaparse.
(function(root){
  const CATS=[
    ['color','Color',{verde:'Verde',amarillo:'Amarillo',verdeClaro:'Verde claro',ok:'OK'}],
    ['tamano','Tamaño',{grande:'Grande',pequeno:'Pequeño',ok:'OK'}],
    ['sanidad','Sanidad',{ok:'OK',enferma:'Enferma'}],
    ['flores','Flores',{si:'Sí',no:'No',ok:'OK'}],
    ['raices','Raíces',{pocaRaiz:'Poca raíz',raizVariedad:'Raíz en variedad',ok:'OK'}]
  ];
  CATS.forEach(cat=>{cat[2].noEvaluada='No evaluada'});
  const STATUS=Object.freeze({
    pendiente:'Pendiente de definir',informativo:'Informativo',
    incidencia:'Incidencia',critico:'Crítico'
  });
  function evalIndicators(measurement,rules){
    const inspected=measurement?.bandejasInspeccionadas;
    const data=measurement?.mediciones;
    if(!Number.isSafeInteger(inspected)||inspected<1||!data||typeof data!=='object'||Array.isArray(data))
      return {available:false,rows:[],inspected:null,warningCount:0,criticalCount:0,
        evaluatedCount:0,configuredCount:0,objective:null};
    const configured=!!rules&&typeof rules==='object'&&!Array.isArray(rules);
    const rows=[];
    for(const [cat,name,labels] of CATS){
      const source=data[cat];
      if(!source||typeof source!=='object'||Array.isArray(source))continue;
      for(const [key,label] of Object.entries(labels)){
        if(!Object.hasOwn(source,key))continue;
        const count=source[key];
        if(!Number.isSafeInteger(count)||count<1||count>inspected)continue;
        const pct=count/inspected*100;
        const r=configured&&key!=='noEvaluada'?rules.criterios?.[cat]?.[key]:null;
        const treatment=key==='noEvaluada'?'informativo':r&&Object.hasOwn(STATUS,r.tratamiento)?r.tratamiento:'pendiente';
        const limit=typeof r?.toleranciaPct==='number'&&Number.isFinite(r.toleranciaPct)&&
          r.toleranciaPct>=0&&r.toleranciaPct<=100?r.toleranciaPct:null;
        const hasAlert=(treatment==='incidencia'||treatment==='critico')&&
          limit!==null && pct>limit+1e-10;
        const level=hasAlert?(treatment==='critico'?'critical':'warning'):'neutral';
        let description;
        if(treatment==='pendiente')description='Sin criterio definido';
        else if(treatment==='informativo')description='Solo información';
        else if(limit===null)description='Sin tolerancia configurada';
        else description=hasAlert?(treatment==='critico'?'Alerta prioritaria':'Supera tolerancia'):'Dentro de tolerancia';
        rows.push({category:cat,categoryLabel:name,option:key,optionLabel:label,
          count,pct,percentDisplay:Number(pct.toFixed(2)),
          treatment,treatmentLabel:STATUS[treatment],tolerance:limit,level,description});
      }
    }
    const objective=configured&&typeof rules.umbralAptitudPct==='number'&&
      rules.umbralAptitudPct>=0&&rules.umbralAptitudPct<=100?rules.umbralAptitudPct:null;
    return {
      available:true,inspected,rows,evaluatedCount:rows.length,
      configuredCount:rows.filter(x=>x.treatment!=='pendiente').length,
      warningCount:rows.filter(x=>x.level==='warning').length,
      criticalCount:rows.filter(x=>x.level==='critical').length,
      objective,hasRules:configured
    };
  }
  root.QCIndicators=Object.freeze({evaluate:evalIndicators});
})(window);
