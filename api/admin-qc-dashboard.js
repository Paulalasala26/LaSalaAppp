'use strict';
// Resumen QC exclusivamente informativo. No modifica mediciones ni registros legacy.
// El denominador de cada tasa es la suma de bandejas INSPECCIONADAS en registros
// cuantificados del mismo estadio y periodo: no representa existencias únicas.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;

const OPTIONS={
  color:{verde:'Verde',amarillo:'Amarillo',verdeClaro:'Verde claro',ok:'OK'},
  tamano:{grande:'Grande',pequeno:'Pequeño',ok:'OK'},
  sanidad:{ok:'OK',enferma:'Enferma'},
  flores:{si:'Sí',no:'No'},
  raices:{pocaRaiz:'Poca raíz',raizVariedad:'Raíz en variedad',ok:'OK'}
};
const CATEGORIES={color:'Color',tamano:'Tamaño',sanidad:'Sanidad',flores:'Flores',raices:'Raíces'};
const TYPES=new Set(['tunel','carga']);
const TREATMENTS=new Set(['pendiente','informativo','incidencia','critico']);
const REF_RE=/^[A-Za-z0-9_-]{1,180}$/;
const PART_RE=/^[A-Za-z0-9._-]{1,100}$/;
const DB_ANCHOR=Date.UTC(2026,5,15);
const DAY_MS=86400000;
const MAX_DAYS=91;
const MAX_ROWS=150;

function dateToDay(iso){
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const [y,m,d]=iso.split('-').map(Number);
  const date=Date.UTC(y,m-1,d);
  if(new Date(date).toISOString().slice(0,10)!==iso)return null;
  return 15+Math.round((date-DB_ANCHOR)/DAY_MS);
}
function dayToISO(d){
  return new Date(DB_ANCHOR+(d-15)*DAY_MS).toISOString().slice(0,10);
}
function parseQuery(query){
  const from=dateToDay(query?.from),to=dateToDay(query?.to);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<15||to<from||to-from>=MAX_DAYS)
    throw httpError(400,'INVALID_DATES');
  const stage=query?.tipo||'todos';
  if(stage!=='todos'&&!TYPES.has(stage))throw httpError(400,'INVALID_STAGE');
  const part=query?.partida||'';
  if(typeof part!=='string'||part.length>40||!/^[\w.-]*$/.test(part))
    throw httpError(400,'INVALID_FILTER');
  return {from,to,stage,part:part.toLocaleUpperCase('es')};
}
function plainObject(value){
  return !!value&&typeof value==='object'&&!Array.isArray(value);
}
function validMeasurement(value,id){
  if(!plainObject(value)||value.schemaVersion!==1||!plainObject(value.legacy)||
    !REF_RE.test(id)||value.legacy.id!==id||!TYPES.has(value.legacy.tipo)||
    !Number.isInteger(value.legacy.dia)||value.legacy.dia<15||
    !PART_RE.test(value.legacy.partida)||
    !Number.isSafeInteger(value.bandejasInspeccionadas)||
    value.bandejasInspeccionadas<1||value.bandejasInspeccionadas>10000000||
    !plainObject(value.mediciones))return false;
  for(const category of Object.keys(OPTIONS)){
    const choices=value.mediciones[category];
    if(!plainObject(choices)||!Object.keys(choices).length)return false;
    for(const [key,qty] of Object.entries(choices)){
      if(!Object.hasOwn(OPTIONS[category],key)||!Number.isSafeInteger(qty)||
        qty<1||qty>value.bandejasInspeccionadas)return false;
    }
  }
  return true;
}
function chosenRule(catalog,type,cat,key){
  const saved=catalog?.[type];
  if(!plainObject(saved)||saved.schemaVersion!==1||saved.stage!==type)return null;
  const rule=saved.criterios?.[cat]?.[key];
  if(!plainObject(rule)||!TREATMENTS.has(rule.tratamiento))return null;
  const tolerance=typeof rule.toleranciaPct==='number'&&Number.isFinite(rule.toleranciaPct)&&
    rule.toleranciaPct>=0&&rule.toleranciaPct<=100?rule.toleranciaPct:null;
  return {treatment:rule.tratamiento,tolerance};
}
function signal(count,inspected,rule){
  const treatment=rule?.treatment||'pendiente';
  const threshold=rule?.tolerance??null;
  if((treatment!=='incidencia'&&treatment!=='critico')||threshold===null)
    return 'none';
  return count/inspected*100>threshold+1e-10?
    (treatment==='critico'?'critical':'warning'):'none';
}
function buildDashboard(raw,rawRules,filters){
  if(!plainObject(raw)||!plainObject(rawRules))throw new Error('QC DB invalid');
  const totalNodeRecords=Object.keys(raw).length;
  // Fail closed rather than returning a potentially misleading partial aggregate.
  if(totalNodeRecords>50000)throw httpError(503,'TOO_MANY_RECORDS');
  const partitions={tunel:{records:0,bandejas:0,warnings:0,critical:0,flagged:0},
    carga:{records:0,bandejas:0,warnings:0,critical:0,flagged:0}};
  const options={},weekly=new Map(),rows=[],batches=new Set();
  let measured=0,warningCount=0,criticalCount=0,flaggedCount=0,unconfiguredCount=0,invalidCount=0;
  let hasConfiguredRules=false,inspectedAcrossRecords=0;
  for(const type of TYPES){
    options[type]={};
    for(const [cat,labels] of Object.entries(OPTIONS)){
      options[type][cat]={};
      for(const [key,name] of Object.entries(labels)){
        options[type][cat][key]={
          type,category:cat,categoryLabel:CATEGORIES[cat],option:key,label:name,affected:0,
          recordCount:0,inspected:0,treatment:'pendiente',tolerance:null,
          warningRecords:0,criticalRecords:0
        };
        const rule=chosenRule(rawRules,type,cat,key);
        if(rule){
          options[type][cat][key].treatment=rule.treatment;
          options[type][cat][key].tolerance=rule.tolerance;
          if((filters.stage==='todos'||filters.stage===type)&&rule.treatment!=='pendiente')
            hasConfiguredRules=true;
        }
      }
    }
  }
  for(const [id,value] of Object.entries(raw)){
    if(!validMeasurement(value,id)){invalidCount++;continue}
    const {legacy}=value;
    if(legacy.dia<filters.from||legacy.dia>filters.to||
       (filters.stage!=='todos'&&filters.stage!==legacy.tipo)||
       (filters.part&&!legacy.partida.toLocaleUpperCase('es').includes(filters.part)))continue;
    const type=legacy.tipo,inspected=value.bandejasInspeccionadas,part=partitions[type];
    measured++;part.records++;part.bandejas+=inspected;inspectedAcrossRecords+=inspected;
    batches.add(legacy.partida);
    let warnings=0,critical=0,pending=0;
    const percentRows=[];
    for(const [cat,labels] of Object.entries(OPTIONS)){
      for(const key of Object.keys(labels)){
        const stat=options[type][cat][key];
        stat.inspected+=inspected;
        const qty=value.mediciones[cat][key];
        if(qty===undefined)continue;
        stat.recordCount++;stat.affected+=qty;
        const rule=chosenRule(rawRules,type,cat,key),level=signal(qty,inspected,rule);
        if(level==='warning'){warnings++;stat.warningRecords++}
        if(level==='critical'){critical++;stat.criticalRecords++}
        if(!rule||rule.treatment==='pendiente')pending++;
        percentRows.push({cat,option:key,qty,percent:qty/inspected*100,level});
      }
    }
    warningCount+=warnings;criticalCount+=critical;
    part.warnings+=warnings;part.critical+=critical;
    if(warnings+critical>0){flaggedCount++;part.flagged++}
    if(pending>0)unconfiguredCount++;
    const weekStart=15+Math.floor((legacy.dia-15)/7)*7;
    const weekKey=dayToISO(weekStart);
    if(!weekly.has(weekKey))weekly.set(weekKey,{
      weekStart:weekKey,records:0,tunel:0,carga:0,flagged:0,warnings:0,critical:0
    });
    const week=weekly.get(weekKey);
    week.records++;week[type]++;week.warnings+=warnings;week.critical+=critical;
    if(warnings+critical>0)week.flagged++;
    rows.push({id,tipo:type,dia:legacy.dia,date:dayToISO(legacy.dia),
      partida:legacy.partida,bandejasInspeccionadas:inspected,
      updatedAt:value.updatedAt||null,version:value.version||0,
      warningCount:warnings,criticalCount:critical,criteriaPending:pending,
      observedOptions:percentRows.length
    });
  }
  rows.sort((a,b)=>b.dia-a.dia||b.criticalCount-a.criticalCount||
    b.warningCount-a.warningCount||a.partida.localeCompare(b.partida,'es',{numeric:true})||
    a.id.localeCompare(b.id));
  const optionTotals=[];
  for(const type of TYPES)for(const cat of Object.keys(OPTIONS))for(const k of Object.keys(OPTIONS[cat])){
    const s=options[type][cat][k];
    // This is a weighted observed rate over separate inspections, not
    // a unique-physical-tray rate or a pass/fail score.
    optionTotals.push({...s,percent:s.inspected?s.affected/s.inspected*100:null});
  }
  const weeklyRows=Array.from(weekly.values()).sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  return {
    scope:'quantified-only',from:dayToISO(filters.from),to:dayToISO(filters.to),
    filterType:filters.stage,filterPart:filters.part,
    stats:{records:measured,partidas:batches.size,
      inspectedAcrossRecords,warningCount,criticalCount,flaggedCount,
      pendingRecordCount:unconfiguredCount,hasConfiguredRules},
    partitions,options:optionTotals,trend:weeklyRows,
    records:rows.slice(0,MAX_ROWS),shownRows:Math.min(rows.length,MAX_ROWS),
    totalRows:rows.length,
    invalidExcluded:invalidCount
  };
}
async function verifyAdmin(req){
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(auth.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,users]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  if(roles[actor]!=='ADMIN'||!validHash(users[actor]))throw httpError(403,'FORBIDDEN');
  return {actor,token};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const filter=parseQuery(req.query);
    const {token}=await verifyAdmin(req);
    const [measurements,criteria]=await Promise.all([
      readKey('lasala-qc-mediciones-v1',token),
      readKey('lasala-qc-reglas-v1',token)
    ]);
    const report=buildDashboard(measurements,criteria,filter);
    return res.status(200).json({ok:true,...report});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503)console.error('QC_DASHBOARD_ERROR',e.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
// Exported helpers permit deterministic fixture tests without Firebase writes.
module.exports._test={dateToDay,dayToISO,parseQuery,validMeasurement,chosenRule,signal,buildDashboard};
