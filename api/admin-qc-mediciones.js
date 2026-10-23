'use strict';
// TEST únicamente. Mediciones QC cuantitativas en un nodo ADITIVO:
// - Jamás actualiza lasala-control-items-v1 ni los segmentos v2.
// - Escribe por registro con control de versión + ETag (sin sobrescritura silenciosa).
// - Solo ADMIN activo y autenticado.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const PREFIX='lasala-qc-mediciones-v1';
const OPTIONS=Object.freeze({
  color:['verde','amarillo','verdeClaro','ok'],
  tamano:['grande','pequeno','ok'],
  sanidad:['ok','enferma'],
  flores:['si','no','ok'],
  raices:['pocaRaiz','raizVariedad','ok']
});
function categoryIssue(category,values,total){
  const notEvaluated=values.noEvaluada||0;
  if(category!=='raices'){
    const sum=Object.values(values).reduce((a,b)=>a+b,0);
    if(sum!==total)return sum<total?'Faltan '+(total-sum)+' bandejas.':'Sobran '+(sum-total)+' bandejas.';
    return '';
  }
  // Los dos defectos de raíces pueden coexistir en una bandeja.
  // OK y No evaluada no se solapan con bandejas defectuosas.
  const evaluated=total-notEvaluated,ok=values.ok||0;
  if(ok>evaluated)return 'OK supera las evaluadas en '+(ok-evaluated)+' bandejas.';
  const affected=evaluated-ok;
  const low=values.pocaRaiz||0,inVariety=values.raizVariedad||0;
  const minimum=Math.max(low,inVariety),maximum=low+inVariety;
  if(affected<minimum)return 'Sobran '+(minimum-affected)+' bandejas con defectos respecto a las evaluadas.';
  if(affected>maximum)return 'Faltan '+(affected-maximum)+' bandejas por clasificar.';
  return '';
}
  const TYPES=new Set(['tunel','carga']);
const RE_ID=/^[A-Za-z0-9_-]{1,180}$/;
const PART_RE=/^[A-Za-z0-9._-]{1,100}$/;
function inputOf(req){
  let b=req.body;
  if(typeof b==='string'){try{b=JSON.parse(b);}catch(_){throw httpError(400,'INVALID_BODY');}}
  if(!b||typeof b!=='object'||Array.isArray(b))throw httpError(400,'INVALID_BODY');
  return b;
}
function validRef(source){
  const day=typeof source?.dia==='string'&&/^\d+$/.test(source.dia)?Number(source.dia):source?.dia;
  if(!source||!RE_ID.test(source.id)||!TYPES.has(source.tipo)||
    !Number.isInteger(day)||day<15||day>4000)
    throw httpError(400,'INVALID_REFERENCE');
  return {id:source.id,tipo:source.tipo,dia:day};
}
function validQty(v){
  return Number.isSafeInteger(v)&&v>0&&v<=10000000;
}
function validateMeasurements(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const value=input.mediciones;
  if(!value||typeof value!=='object'||Array.isArray(value))throw httpError(400,'INVALID_MEASUREMENTS');
  if(Object.keys(value).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
    throw httpError(400,'INVALID_MEASUREMENTS');
  const clean={};
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const source=value[cat];
    if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length===0)
      throw httpError(400,'MISSING_CATEGORY');
    const entries=Object.entries(source);
    const choices=new Set([...allowed,'noEvaluada']);
    clean[cat]={};
    for(const [key,qty] of entries){
      if(!choices.has(key)||!validQty(qty)||qty>input.bandejasInspeccionadas)
        throw httpError(400,'INVALID_QUANTITY');
      clean[cat][key]=qty;
    }
    if(categoryIssue(cat,clean[cat],input.bandejasInspeccionadas))throw httpError(400,'CATEGORY_TOTAL_MISMATCH');
  }
  return clean;
}
const SANIDAD_DISEASE_KEYS=Object.freeze(['enfermedad1','enfermedad2','enfermedad3','enfermedad4']);
// Claves estables: cambiar las etiquetas por enfermedades/plagas reales antes de PRD,
// nunca asignar diagnósticos nuevos a un antiguo 'enferma' sin dato de origen.
function validateCategorias(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const source=input.categorias;
  if(!source||typeof source!=='object'||Array.isArray(source)||
    Object.keys(source).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
    throw httpError(400,'INVALID_MEASUREMENTS');
  const clean={};
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const item=source[cat];
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).sort().join('|')!=='opciones|porcentajeInvalidas')
      throw httpError(400,'INVALID_MEASUREMENTS');
    const opts=item.opciones,pct=item.porcentajeInvalidas;
    if(!Array.isArray(opts)||!opts.length||new Set(opts).size!==opts.length||
       opts.some(o=>![...allowed.filter(o=>cat!=='flores'||o!=='no'),'noEvaluada'].includes(o))||
       !Number.isInteger(pct)||pct<0||pct>100||pct%10!==0)
      throw httpError(400,'INVALID_MEASUREMENTS');
    if(opts.includes('noEvaluada')&&opts.length!==1)throw httpError(400,'INVALID_MEASUREMENTS');
    if(opts.length===1){
      const required=opts[0]==='ok'||opts[0]==='noEvaluada'?0:100;
      if(pct!==required)throw httpError(400,'INVALID_PERCENT');
    }
    clean[cat]={opciones:opts,porcentajeInvalidas:pct};
  }
  return clean;
}
// Formato v3: una incidencia de sanidad, un porcentaje propio (10,20,...,100).
// El total es la suma (sin solapamientos) redondeada hacia abajo al tramo de 10.
// No aceptar silenciosamente más del 100%, ni asignar enfermedad a registros v2.
function validateDiseaseCategorias(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const source=input.categorias;
  if(!source||typeof source!=='object'||Array.isArray(source)||
     Object.keys(source).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
     throw httpError(400,'INVALID_MEASUREMENTS');
  const clean={};
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const item=source[cat];
    if(!item||typeof item!=='object'||Array.isArray(item))throw httpError(400,'INVALID_MEASUREMENTS');
    const sanidad=cat==='sanidad';
    if(Object.keys(item).sort().join('|')!==(sanidad?
       'opciones|porcentajeInvalidas|porcentajesEnfermedades':'opciones|porcentajeInvalidas'))
       throw httpError(400,'INVALID_MEASUREMENTS');
    const opts=item.opciones,pct=item.porcentajeInvalidas;
    const choices=sanidad?['ok',...SANIDAD_DISEASE_KEYS,'noEvaluada']:
      [...allowed.filter(o=>cat!=='flores'||o!=='no'),'noEvaluada'];
    if(!Array.isArray(opts)||!opts.length||new Set(opts).size!==opts.length||
       opts.some(o=>!choices.includes(o))||
       !Number.isInteger(pct)||pct<0||pct>100||pct%10!==0)
       throw httpError(400,'INVALID_MEASUREMENTS');
    if(opts.includes('noEvaluada')&&opts.length!==1)throw httpError(400,'INVALID_MEASUREMENTS');
    if(!sanidad){
      if(opts.length===1&&pct!==(opts[0]==='ok'||opts[0]==='noEvaluada'?0:100))
        throw httpError(400,'INVALID_PERCENT');
      clean[cat]={opciones:opts,porcentajeInvalidas:pct};
      continue;
    }
    const details=item.porcentajesEnfermedades;
    if(!details||typeof details!=='object'||Array.isArray(details))
      throw httpError(400,'INVALID_DISEASE_PERCENT');
    const diseases=opts.filter(o=>SANIDAD_DISEASE_KEYS.includes(o));
    if(Object.keys(details).length!==diseases.length||
       Object.keys(details).some(k=>!diseases.includes(k)))
      throw httpError(400,'INVALID_DISEASE_PERCENT');
    let sum=0;
    for(const key of diseases){
      const n=details[key];
      if(!Number.isInteger(n)||n<10||n>100||n%10!==0)
        throw httpError(400,'INVALID_DISEASE_PERCENT');
      sum+=n;
    }
    if(sum>100)throw httpError(400,'DISEASE_PERCENT_OVER_100');
    const rounded=Math.floor(sum/10)*10;
    if(pct!==rounded)throw httpError(400,'INVALID_DISEASE_TOTAL');
    if(!diseases.length&&opts.length!==1)throw httpError(400,'INVALID_MEASUREMENTS');
    clean[cat]={opciones:opts,porcentajeInvalidas:rounded,
      porcentajesEnfermedades:Object.fromEntries(diseases.map(k=>[k,details[k]]))};
  }
  return clean;
}
// v4: porcentaje global por categoría. Selección exclusiva salvo varias enfermedades
// de Sanidad; OK es incompatible con cualquier enfermedad y No evaluada es exclusiva.
function validateGlobalCategorias(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const source=input.categorias;
  if(!source||typeof source!=='object'||Array.isArray(source)||
    Object.keys(source).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
    throw httpError(400,'INVALID_MEASUREMENTS');
  const clean={};
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const item=source[cat];
    if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).sort().join('|')!=='opciones|porcentajeInvalidas')
      throw httpError(400,'INVALID_MEASUREMENTS');
    const opts=item.opciones,pct=item.porcentajeInvalidas;
    const choices=cat==='sanidad'?['ok',...SANIDAD_DISEASE_KEYS,'noEvaluada']:
      [...allowed.filter(o=>cat!=='flores'||o!=='no'),'noEvaluada'];
    if(!Array.isArray(opts)||opts.length===0||new Set(opts).size!==opts.length||
       opts.some(o=>!choices.includes(o))||
       !Number.isInteger(pct)||pct<0||pct>100||pct%10!==0)
      throw httpError(400,'INVALID_MEASUREMENTS');
    const exclusive=opts.includes('ok')||opts.includes('noEvaluada');
    if(exclusive&&opts.length!==1)throw httpError(400,'CATEGORY_EXCLUSIVE');
    if(cat!=='sanidad'&&opts.length!==1)throw httpError(400,'CATEGORY_EXCLUSIVE');
    if(exclusive){
      if(pct!==0)throw httpError(400,'INVALID_PERCENT');
    }else if(pct<10){
      throw httpError(400,'INVALID_PERCENT');
    }
    clean[cat]={opciones:opts,porcentajeInvalidas:pct};
  }
  return clean;
}
// Modelo v5: un porcentaje de inválidas para toda la inspección; solo Sanidad
// desglosa enfermedades individualmente. Los demás grupos tienen estado único.
function validateEvaluationV5(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const source=input.categorias;
  if(!source||typeof source!=='object'||Array.isArray(source)||
     Object.keys(source).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
    throw httpError(400,'INVALID_MEASUREMENTS');
  const total=input.porcentajeInvalidasGlobal;
  if(!Number.isInteger(total)||total<0||total>100||total%10!==0)
    throw httpError(400,'INVALID_GLOBAL_PERCENT');
  const clean={};let hasIssue=false;
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const item=source[cat],isHealth=cat==='sanidad';
    if(!item||typeof item!=='object'||Array.isArray(item)||
       Object.keys(item).sort().join('|')!==(isHealth?'opciones|porcentajesEnfermedades':'opciones'))
      throw httpError(400,'INVALID_MEASUREMENTS');
    const opts=item.opciones;
    const validOptions=isHealth?['ok','noEvaluada',...SANIDAD_DISEASE_KEYS]:
      [...allowed.filter(k=>cat!=='flores'||k!=='no'),'noEvaluada'];
    if(!Array.isArray(opts)||!opts.length||new Set(opts).size!==opts.length||
       opts.some(k=>!validOptions.includes(k)))
      throw httpError(400,'INVALID_MEASUREMENTS');
    if((!isHealth&&opts.length!==1)||
       ((opts.includes('ok')||opts.includes('noEvaluada'))&&opts.length!==1))
      throw httpError(400,'CATEGORY_EXCLUSIVE');
    const affected=opts.filter(k=>k!=='ok'&&k!=='noEvaluada');
    if(affected.length)hasIssue=true;
    if(!isHealth){clean[cat]={opciones:opts};continue;}
    const details=item.porcentajesEnfermedades;
    if(!details||typeof details!=='object'||Array.isArray(details)||
       Object.keys(details).length!==affected.length||
       Object.keys(details).some(k=>!affected.includes(k)))
      throw httpError(400,'INVALID_DISEASE_PERCENT');
    const cleaned={};
    let diseaseSum=0;
    for(const key of affected){
      const pct=details[key];
      if(!SANIDAD_DISEASE_KEYS.includes(key)||!Number.isInteger(pct)||
         pct<10||pct>100||pct%10!==0)
        throw httpError(400,'INVALID_DISEASE_PERCENT');
      cleaned[key]=pct;diseaseSum+=pct;
    }
    // Con esta distribución el porcentaje global mide bandejas únicas:
    // no sumar incidencias que podrían concurrir en una misma bandeja.
    if(diseaseSum>100)throw httpError(400,'DISEASE_PERCENT_OVER_100');
    clean[cat]={opciones:opts,porcentajesEnfermedades:cleaned};
  }
  if(!hasIssue&&total!==0)
    throw httpError(400,'INVALID_GLOBAL_PERCENT');
  return {categorias:clean,porcentajeInvalidasGlobal:total};
}
function pathFor(id){return DB+'/'+PREFIX+'/'+encodeURIComponent(id)+'.json';}
function sourcePath(ref){
  const q=Math.floor((ref.dia-15)/14);
  const key='lasala-control-items-v2-'+ref.tipo+'-q'+q;
  return DB+'/'+encodeURIComponent(key)+'/'+encodeURIComponent(ref.id)+'.json';
}
async function getJson(url,token,etag){
  const r=await fetch(url,{headers:{
    Authorization:'Bearer '+token,...(etag?{'X-Firebase-ETag':'true'}:{})
  },cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Firebase read failed: '+r.status);
  let val=await r.json();
  if(typeof val==='string'){try{val=JSON.parse(val);}catch(_){throw new Error('INVALID_STORED_JSON');}}
  return {value:val,etag:r.headers.get('ETag')};
}
async function legacyRecord(ref,token){
  const {value}=await getJson(sourcePath(ref),token,false);
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.id!==ref.id||value.tipo!==ref.tipo||value.dia!==ref.dia||
     typeof value.partida!=='string'||!PART_RE.test(value.partida))
    throw httpError(409,'SOURCE_NOT_FOUND_OR_CHANGED');
  return value;
}
function validateStored(entry,ref,partida){
  if(entry===null)return {version:0};
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     ![1,2,3,4,5].includes(entry.schemaVersion)||!Number.isInteger(entry.version)||entry.version<1||
     entry.legacy?.id!==ref.id||entry.legacy?.tipo!==ref.tipo||
     entry.legacy?.dia!==ref.dia||entry.legacy?.partida!==partida)
    throw httpError(409,'SAVED_CONFLICT');
  return entry;
}
async function checkQCActor(req,ref){
  const raw=req.headers.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,accounts]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  const role=roles[actor];
  const authorized=role==='ADMIN'||role==='TECNICO'||
    (role==='CARGADOR'&&ref.tipo==='carga');
  if(!authorized||!validHash(accounts[actor]))throw httpError(403,'FORBIDDEN');
  return {actor,token};
}
// Consulta agrupada de estados cuantitativos: comparte despliegue con QC.
// Solo lectura, validación por ID/tipo/día/partida; nunca escribe Firebase.
function validarConsultaEstados(req){
  if(req.modo!=='estados'||!TYPES.has(req.tipo)||
     !Number.isInteger(req.dia)||req.dia<15||req.dia>4000||
     !Array.isArray(req.registros)||req.registros.length<1||req.registros.length>60)
    throw httpError(400,'INVALID_STATUS_QUERY');
  const vistos=new Set();
  for(const x of req.registros){
    if(!x||typeof x!=='object'||!RE_ID.test(x.id)||
       typeof x.partida!=='string'||!PART_RE.test(x.partida)||vistos.has(x.id))
      throw httpError(400,'INVALID_STATUS_REFERENCE');
    vistos.add(x.id);
  }
  return req;
}
async function consultarEstadosQC(req,res,data){
  const q=validarConsultaEstados(data);
  const {token}=await checkQCActor(req,{tipo:q.tipo});
  const estados=Object.create(null);
  for(let i=0;i<q.registros.length;i+=8){
    const refs=q.registros.slice(i,i+8);
    const loaded=await Promise.all(refs.map(async ref=>{
      const {value}=await getJson(pathFor(ref.id),token,false);
      if(value===null)return false;
      try{
        const stored=validateStored(value,{id:ref.id,tipo:q.tipo,dia:q.dia},ref.partida);
        if(stored.version<1)return false;
        if(stored.schemaVersion===5)validateEvaluationV5(stored);
        else if(stored.schemaVersion===4)validateGlobalCategorias(stored);
        else if(stored.schemaVersion===3)validateDiseaseCategorias(stored);
        else if(stored.schemaVersion===2)validateCategorias(stored);
        else validateMeasurements(stored);
        return true;
      }catch(_){return false;}
    }));
    refs.forEach((r,index)=>{estados[r.id]=loaded[index]});
  }
  return res.status(200).json({ok:true,tipo:q.tipo,dia:q.dia,estados});
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  let phase='REQUEST';
  try{
    const request=req.method==='GET'?req.query:inputOf(req);
    if(req.method==='POST' && request?.modo==='estados'){
      phase='STATUS_READ';
      return await consultarEstadosQC(req,res,request);
    }
    const ref=validRef(request);
    phase='AUTH';
    const {actor,token}=await checkQCActor(req,ref);
    phase='SOURCE';
    const source=await legacyRecord(ref,token);
    if(req.method==='GET'){
      const probe=request.probe==='etag';
      phase='MEASUREMENT_READ';
      const {value,etag}=await getJson(pathFor(ref.id),token,probe);
      const stored=validateStored(value,ref,source.partida);
      return res.status(200).json({ok:true,record:value?{
        version:stored.version,updatedAt:stored.updatedAt,
        updatedBy:stored.updatedBy,bandejasInspeccionadas:stored.bandejasInspeccionadas,
        mediciones:stored.mediciones,categorias:stored.categorias,
        porcentajeInvalidasGlobal:stored.porcentajeInvalidasGlobal,schemaVersion:stored.schemaVersion
      }:null,sourcePartida:source.partida,
      ...(probe?{diagnostic:{etagAvailable:!!etag}}:{})});
    }
    phase='VALIDATION';
    if(request.partida!==source.partida)throw httpError(409,'SOURCE_CHANGED');
    if(!Number.isSafeInteger(request.version)||request.version<0)
      throw httpError(400,'INVALID_VERSION');
    const isPercent=!!request.categorias;
    const hasDiseaseBreakdown=isPercent&&
      Object.prototype.hasOwnProperty.call(request.categorias?.sanidad||{},'porcentajesEnfermedades');
    // No interpretar formatos antiguos como v4: esos borradores siguen protegidos.
    const v4=request.schemaVersion===4,v5=request.schemaVersion===5;
    if((v4||v5)&&!isPercent||v4&&hasDiseaseBreakdown)
      throw httpError(400,'INVALID_MEASUREMENTS');
    const checked=v5?validateEvaluationV5(request):
      v4?validateGlobalCategorias(request):
      hasDiseaseBreakdown?validateDiseaseCategorias(request):
      isPercent?validateCategorias(request):validateMeasurements(request);
    phase='ETAG_READ';
    const stored=await getJson(pathFor(ref.id),token,true);
    if(!stored.etag)throw new Error('Firebase ETag unavailable');
    phase='ETAG_COMPARE';
    const before=validateStored(stored.value,ref,source.partida);
    if(before.version!==request.version)throw httpError(409,'CONCURRENT_MODIFICATION');
    const now=new Date().toISOString();
    const next={
      schemaVersion:v5?5:v4?4:hasDiseaseBreakdown?3:isPercent?2:1,version:before.version+1,
      legacy:{...ref,partida:source.partida},
      bandejasInspeccionadas:request.bandejasInspeccionadas,
      ...(v5?{
        categorias:checked.categorias,porcentajeInvalidasGlobal:checked.porcentajeInvalidasGlobal,
        legacyMediciones:before.legacyMediciones||before.mediciones||null,
        ...((before.legacyCategorias||before.categorias&&before.schemaVersion!==5)?
          {legacyCategorias:before.legacyCategorias||before.categorias}:{})
      }:isPercent?{categorias:checked,
        legacyMediciones:before.legacyMediciones||before.mediciones||null,
        ...(v4&&before.schemaVersion===3?
          {legacyCategorias:before.legacyCategorias||before.categorias}:
          before.legacyCategorias?{legacyCategorias:before.legacyCategorias}:{})
      }:{mediciones:checked}),
      createdAt:before.createdAt||now,
      updatedAt:now,updatedBy:actor,
      resultadoQC:null
    };
    phase='WRITE';
    const write=await fetch(pathFor(ref.id),{
      method:'PUT',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json',
        'if-match':stored.etag
      },
      body:JSON.stringify(next),
      signal:AbortSignal.timeout(10000)
    });
    if(write.status===412)throw httpError(409,'CONCURRENT_MODIFICATION');
    if(!write.ok)throw new Error('Firebase write failed: '+write.status);
    console.info('QC_MEASUREMENTS_TEST',actor,ref.tipo,ref.id,'v'+next.version);
    return res.status(200).json({ok:true,version:next.version,updatedAt:now,updatedBy:actor});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503){
      console.error('QC_MEASUREMENTS_TEST_ERROR',e.message);
      // Diagnóstico de lista cerrada, sin datos personales, URLs ni credenciales.
      const msg=String(e.message||'');
      const failedRead=/^Firebase read failed: (\d{3})$/.exec(msg);
      const failedWrite=/^Firebase write failed: (\d{3})$/.exec(msg);
      const diagnostic=failedWrite?'QC_WRITE_HTTP_'+failedWrite[1]:
        failedRead?'QC_'+phase+'_HTTP_'+failedRead[1]:
        msg==='Firebase ETag unavailable'?'QC_ETAG_MISSING':
        e.name==='TimeoutError'||e.name==='AbortError'?'QC_'+phase+'_TIMEOUT':
        'QC_'+phase+'_SERVICE_ERROR';
      return res.status(503).json({error:'SERVICE_UNAVAILABLE',diagnostic});
    }
    return res.status(status).json({error:e.code});
  }
};
