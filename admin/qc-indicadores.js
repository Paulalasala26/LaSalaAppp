'use strict';
// Indicadores informativos por registro QC: NUNCA decide ni bloquea una partida.
// Solo porcentajes de cada opción respecto a las bandejas inspeccionadas.
// No sumar porcentajes: las bandejas con varios defectos pueden solaparse.
(function(root){
  const CATS=[
    ['color','Color',{verde:'Verde',amarillo:'Amarillo',verdeClaro:'Verde claro',ok:'OK'}],
    ['tamano','Tamaño',{grande:'Grande',pequeno:'Pequeño',ok:'OK'}],
    ['sanidad','Sanidad',{ok:'OK',enferma:'Enferma',enfermedad1:'Enfermedad 1',enfermedad2:'Enfermedad 2',enfermedad3:'Enfermedad 3',enfermedad4:'Enfermedad 4'}],
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
    // V5: un porcentaje de toda la evaluación, sin porcentajes por el resto
    // de categorías; enfermedades con estimación propia y posible solapamiento.
    if([5,6].includes(measurement?.schemaVersion)&&
       measurement?.categorias&&Number.isInteger(measurement.porcentajeInvalidasGlobal)){
      const rows=[];
      for(const [cat,name,labels] of CATS){
        const item=measurement.categorias[cat];
        if(!item||!Array.isArray(item.opciones))continue;
        if(cat==='sanidad'){
          const dis=item.porcentajesEnfermedades||{};
          for(const k of ['enfermedad1','enfermedad2','enfermedad3','enfermedad4']){
            if(!Object.hasOwn(dis,k))continue;
            rows.push({category:cat,categoryLabel:name,option:k,
              optionLabel:labels[k],count:null,pct:dis[k],percentDisplay:dis[k],
              treatment:'informativo',treatmentLabel:'Informativo',tolerance:null,
              level:'neutral',description:'Porcentaje individual de enfermedad'});
          }
        }
      }
      rows.push({category:'global',categoryLabel:'Evaluación',option:'invalidas',
        optionLabel:'Total inválidas',count:null,pct:measurement.porcentajeInvalidasGlobal,
        percentDisplay:measurement.porcentajeInvalidasGlobal,treatment:'informativo',
        treatmentLabel:'Informativo',tolerance:null,level:'neutral',
        description:'Índice global de los cinco bloques'});
      return {available:true,inspected,rows,evaluatedCount:rows.length,
        configuredCount:0,warningCount:0,criticalCount:0,objective:null,hasRules:false};
    }
    // V2: porcentaje global por categoría, sin atribuir cantidades a opciones.
    if(Number.isSafeInteger(inspected)&&inspected>0&&measurement?.categorias){
      const rows=[];
      for(const [cat,name,labels] of CATS){
        const item=measurement.categorias[cat];
        if(!item||!Array.isArray(item.opciones)||!Number.isInteger(item.porcentajeInvalidas))continue;
        if(cat==='sanidad'&&item.porcentajesEnfermedades){
          const names={enfermedad1:'Enfermedad 1',enfermedad2:'Enfermedad 2',
            enfermedad3:'Enfermedad 3',enfermedad4:'Enfermedad 4'};
          for(const key of ['enfermedad1','enfermedad2','enfermedad3','enfermedad4']){
            if(!Object.hasOwn(item.porcentajesEnfermedades,key))continue;
            const value=item.porcentajesEnfermedades[key];
            rows.push({category:cat,categoryLabel:name,option:key,
              optionLabel:names[key],count:null,pct:value,percentDisplay:value,
              treatment:'informativo',treatmentLabel:'Informativo',
              tolerance:null,level:'neutral',description:'Porcentaje individual de enfermedad'});
          }
          rows.push({category:cat,categoryLabel:name,option:'invalidas',
            optionLabel:'Total inválidas',count:null,pct:item.porcentajeInvalidas,
            percentDisplay:item.porcentajeInvalidas,
            treatment:'informativo',treatmentLabel:'Informativo',
            tolerance:null,level:'neutral',description:'Suma de enfermedades redondeada hacia abajo'});
          continue;
        }
        rows.push({category:cat,categoryLabel:name,option:'invalidas',
          optionLabel:item.opciones.map(k=>cat==='flores'&&k==='no'?'Ok':cat==='flores'&&k==='ok'?'Ok':cat==='flores'&&k==='si'?'Con flores':labels[k]||k).join(' + '),
          count:null,pct:item.porcentajeInvalidas,percentDisplay:item.porcentajeInvalidas,
          treatment:'informativo',treatmentLabel:'Informativo',
          tolerance:null,level:'neutral',description:'Porcentaje global de inválidas'});
      }
      return {available:rows.length>0,inspected,rows,evaluatedCount:rows.length,
        configuredCount:0,warningCount:0,criticalCount:0,objective:null,hasRules:false};
    }
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
