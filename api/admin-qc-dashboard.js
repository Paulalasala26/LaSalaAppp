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
const QC_CATEGORIES=['color','tamano','sanidad','flores','raices'];
function legacyComplete(record){
  return QC_CATEGORIES.every(key=>plainObject(record[key])&&
    Object.values(record[key]).some(Boolean));
}
// Reutiliza las mismas quincenas y el mismo índice que admin/control.js.
async function fetchLegacyControls(token,filters){
  const index=await readKey('lasala-control-items-v2-index',token);
  if(!plainObject(index)||!plainObject(index.shards))
    throw httpError(503,'INVALID_CONTROL_INDEX');
  const qMin=Math.max(0,Math.floor((filters.from-15)/14));
  const qMax=Math.floor((filters.to-15)/14);
  const types=filters.stage==='todos'?['tunel','carga']:[filters.stage],wanted=[];
  for(const type of types){
    for(let q=qMin;q<=qMax;q++){
      const meta=index.shards[type+'|'+q];
      if(!meta)continue;
      const key='lasala-control-items-v2-'+type+'-q'+q;
      if(!plainObject(meta)||meta.key!==key||meta.tipo!==type||Number(meta.q)!==q)
        throw httpError(503,'INVALID_CONTROL_INDEX');
      wanted.push({type,q,key});
    }
  }
  const rows=[],ids=new Set();
  for(let i=0;i<wanted.length;i+=4){
    const pack=await Promise.all(wanted.slice(i,i+4).map(async item=>({
      ...item,data:await readKey(item.key,token)
    })));
    for(const item of pack){
      if(!plainObject(item.data))throw httpError(503,'INVALID_CONTROL_SHARD');
      for(const [id,record] of Object.entries(item.data)){
        // Mismo criterio de inclusión que el listado administrativo.
        if(!plainObject(record)||record.id!==id||record.tipo!==item.type||
           !Number.isInteger(record.dia)||
           record.dia<filters.from||record.dia>filters.to)continue;
        if(ids.has(id))throw httpError(503,'DUPLICATE_CONTROL_ID');
        ids.add(id);
        if(filters.part&&!String(record.partida||'').toLocaleUpperCase('es').includes(filters.part))continue;
        rows.push(record);
      }
    }
  }
  return rows;
}
function buildDashboard(raw,rawRules,filters,legacyRecords=[]){
  if(!plainObject(raw)||!plainObject(rawRules)||!Array.isArray(legacyRecords))
    throw new Error('QC DB invalid');
  if(Object.keys(raw).length>50000)throw httpError(503,'TOO_MANY_RECORDS');
  const partitions={tunel:{records:0,completed:0,pending:0,measured:0,
      bandejas:0,warnings:0,critical:0,flagged:0},
    carga:{records:0,completed:0,pending:0,measured:0,
      bandejas:0,warnings:0,critical:0,flagged:0}};
  const options={},weekly=new Map(),rows=[],batches=new Set(),measuredBatches=new Set();
  let measured=0,completed=0,warningCount=0,criticalCount=0,flaggedCount=0;
  let pendingCriteriaCount=0,invalidCount=0,unmatchedCount=0,inspectedAcrossRecords=0;
  let hasConfiguredRules=false;
  for(const type of TYPES){
    options[type]={};
    for(const [cat,labels] of Object.entries(OPTIONS)){
      options[type][cat]={};
      for(const [key,name] of Object.entries(labels)){
        const rule=chosenRule(rawRules,type,cat,key);
        options[type][cat][key]={
          type,category:cat,categoryLabel:CATEGORIES[cat],option:key,label:name,
          affected:0,recordCount:0,inspected:0,
          treatment:rule?.treatment||'pendiente',tolerance:rule?.tolerance??null,
          warningRecords:0,criticalRecords:0
        };
        if((filters.stage==='todos'||filters.stage===type)&&rule?.treatment!=='pendiente'&&rule)
          hasConfiguredRules=true;
      }
    }
  }
  const measurementById=new Map();
  for(const [id,value] of Object.entries(raw)){
    if(!validMeasurement(value,id)){invalidCount++;continue}
    measurementById.set(id,value);
  }
  const ids=new Set(),matchedQuantified=new Set();
  for(const rec of legacyRecords){
    if(!plainObject(rec)||!REF_RE.test(rec.id)||!TYPES.has(rec.tipo)||
       !Number.isInteger(rec.dia)||rec.dia<filters.from||rec.dia>filters.to||
       (filters.stage!=='todos'&&rec.tipo!==filters.stage)||
       (filters.part&&!String(rec.partida||'').toLocaleUpperCase('es').includes(filters.part)))continue;
    if(ids.has(rec.id))throw httpError(503,'DUPLICATE_CONTROL_ID');
    ids.add(rec.id);
    const type=rec.tipo,part=partitions[type],done=legacyComplete(rec);
    part.records++;
    if(done){part.completed++;completed++}else part.pending++;
    if(typeof rec.partida==='string'&&rec.partida.trim())batches.add(rec.partida.trim());
    const measurement=measurementById.get(rec.id);
    // Medición válida solo si la partida, estadio y fecha siguen coincidiendo.
    const quant=measurement&&measurement.legacy.tipo===type&&
      measurement.legacy.dia===rec.dia&&measurement.legacy.partida===rec.partida?
      measurement:null;
    const weekStart=15+Math.floor((rec.dia-15)/7)*7;
    const weekKey=dayToISO(weekStart);
    if(!weekly.has(weekKey))weekly.set(weekKey,{
      weekStart:weekKey,records:0,tunel:0,carga:0,completed:0,
      measured:0,flagged:0,warnings:0,critical:0
    });
    const week=weekly.get(weekKey);
    week.records++;week[type]++;if(done)week.completed++;
    let warnings=0,critical=0,pending=0,observed=0;
    if(quant){
      matchedQuantified.add(rec.id);
      measured++;part.measured++;week.measured++;
      const inspected=quant.bandejasInspeccionadas;
      inspectedAcrossRecords+=inspected;part.bandejas+=inspected;
      if(typeof rec.partida==='string'&&rec.partida.trim())measuredBatches.add(rec.partida.trim());
      for(const [cat,labels] of Object.entries(OPTIONS)){
        for(const key of Object.keys(labels)){
          const stat=options[type][cat][key];
          stat.inspected+=inspected;
          const qty=quant.mediciones[cat][key];
          if(qty===undefined)continue;
          observed++;stat.affected+=qty;stat.recordCount++;
          const rule=chosenRule(rawRules,type,cat,key);
          const level=signal(qty,inspected,rule);
          if(level==='warning'){warnings++;stat.warningRecords++}
          if(level==='critical'){critical++;stat.criticalRecords++}
          if(!rule||rule.treatment==='pendiente')pending++;
        }
      }
      if(pending)pendingCriteriaCount++;
      part.warnings+=warnings;part.critical+=critical;
      warningCount+=warnings;criticalCount+=critical;
      week.warnings+=warnings;week.critical+=critical;
      if(warnings+critical>0){flaggedCount++;part.flagged++;week.flagged++}
    }
    rows.push({
      id:rec.id,tipo:type,dia:rec.dia,date:dayToISO(rec.dia),
      partida:typeof rec.partida==='string'?rec.partida:'',
      done,quantified:!!quant,numBandejasLegacy:rec.numBandejas??null,
      bandejasInspeccionadas:quant?quant.bandejasInspeccionadas:null,
      version:quant?.version||0,updatedAt:quant?.updatedAt||null,
      warningCount:quant?warnings:null,criticalCount:quant?critical:null,
      criteriaPending:quant?pending:null,observedOptions:quant?observed:0
    });
  }
  for(const [id,measurement] of measurementById){
    if(measurement.legacy.dia>=filters.from&&measurement.legacy.dia<=filters.to&&
       (filters.stage==='todos'||filters.stage===measurement.legacy.tipo)&&
       (!filters.part||measurement.legacy.partida.toLocaleUpperCase('es').includes(filters.part))&&
       !matchedQuantified.has(id))unmatchedCount++;
  }
  rows.sort((a,b)=>b.dia-a.dia||
    b.criticalCount-a.criticalCount||b.warningCount-a.warningCount||
    a.partida.localeCompare(b.partida,'es',{numeric:true})||a.id.localeCompare(b.id));
  const optionTotals=[];
  for(const type of TYPES)for(const cat of Object.keys(OPTIONS))for(const k of Object.keys(OPTIONS[cat])){
    const stat=options[type][cat][k];
    optionTotals.push({...stat,percent:stat.inspected?stat.affected/stat.inspected*100:null});
  }
  return {
    scope:'legacy-and-quantified',from:dayToISO(filters.from),to:dayToISO(filters.to),
    filterType:filters.stage,filterPart:filters.part,
    stats:{records:rows.length,partidas:batches.size,completed,pending:rows.length-completed,
      measured,unmeasured:rows.length-measured,measuredPartidas:measuredBatches.size,
      inspectedAcrossRecords,warningCount,criticalCount,flaggedCount,
      pendingRecordCount:pendingCriteriaCount,hasConfiguredRules},
    partitions,options:optionTotals,
    trend:Array.from(weekly.values()).sort((a,b)=>a.weekStart.localeCompare(b.weekStart)),
    records:rows.slice(0,MAX_ROWS),shownRows:Math.min(rows.length,MAX_ROWS),
    totalRows:rows.length,invalidExcluded:invalidCount,unmatchedMeasurements:unmatchedCount
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
    const [measurements,criteria,legacy]=await Promise.all([
      readKey('lasala-qc-mediciones-v1',token),
      readKey('lasala-qc-reglas-v1',token),
      fetchLegacyControls(token,filter)
    ]);
    const report=buildDashboard(measurements,criteria,filter,legacy);
    return res.status(200).json({ok:true,...report});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503)console.error('QC_DASHBOARD_ERROR',e.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
// Exported helpers permit deterministic fixture tests without Firebase writes.
module.exports._test={dateToDay,dayToISO,parseQuery,validMeasurement,chosenRule,signal,legacyComplete,fetchLegacyControls,buildDashboard};
