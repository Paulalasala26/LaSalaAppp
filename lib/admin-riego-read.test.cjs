'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const reader=require('./admin-riego-read');
const {parseQuery,toDay,toISO,buildReport,readShard}=reader._test;
const filter=parseQuery({from:'2026-11-01',to:'2026-11-04',inv:'1A',buscar:''});
test('riego: fechas, ámbito e intervalo máximo',()=>{
  assert.equal(toISO(toDay('2026-11-04')),'2026-11-04');
  assert.equal(parseQuery({from:'2026-09-01',to:'2026-11-04',inv:'1A'}).inv,'1A');
  for(const q of [
    {from:'2026-01-01',to:'2026-11-04',inv:'1A'},
    {from:'2026-06-15',to:'2026-11-04',inv:'1A'},
    {from:'2026-11-04',to:'2026-11-01',inv:'1A'},
    {from:'2026-02-30',to:'2026-11-04',inv:'1A'},
    {from:'2026-11-01',to:'2026-11-04',inv:'1A/../../'},
    {from:'2026-11-01',to:'2026-11-04',inv:'1A',buscar:'x\u0000'}
  ])assert.throws(()=>parseQuery(q),{httpStatus:400});
});
test('riego: consulta de celdas reales, histórico en texto y autor de marca',()=>{
  const day=toDay('2026-11-04');
  const report=buildReport({inv:'1A',data:{[day]:{
    1:'Riego por goteo',
    2:{texto:'Aspersión 10 minutos',marcadoPor:'JULIO'},
    3:{texto:'   '},
    4:0,
    '5x':{texto:'ignorar'}
  }}},filter);
  assert.equal(report.source,'riego-v2');
  assert.equal(report.readonly,true);
  assert.equal(report.ejecucionConfirmada,false);
  assert.equal(report.totals.registros,2);
  assert.equal(report.totals.invalidos,3);
  assert.deepEqual(report.rows.map(r=>r.calle),[1,2]);
  assert.equal(report.rows[1].marcadoPor,'JULIO');
  assert.equal(report.totals.dias,1);
  assert.equal(report.totals.calles,2);
});
test('riego: búsqueda por texto, usuario y calle sin alterar fuentes',()=>{
  const day=toDay('2026-11-04');
  const data={[day]:{1:{texto:'Riego 8 minutos',marcadoPor:'FRAN'},
    2:{texto:'Manguera',marcadoPor:'DENNIS'}}};
  const original=JSON.stringify(data);
  const found=buildReport({inv:'1A',data},{...filter,buscar:'FRAN'});
  assert.equal(found.totals.registros,1);
  assert.equal(found.rows[0].calle,1);
  assert.equal(JSON.stringify(data),original);
  assert.equal(buildReport({inv:'1A',data},{...filter,buscar:'no encontrado'}).rows.length,0);
});
test('riego: diferencia entre un INV sin índice y un shard indexado ausente',async()=>{
  const original=global.fetch;
  const urls=[];
  global.fetch=async url=>{
    urls.push(String(url));
    if(String(url).includes('lasala-riego-v2-index'))return {ok:true,json:async()=>JSON.stringify(['1A','2B'])};
    return {ok:true,json:async()=>null};
  };
  try{
    const empty=await readShard('local-test',{...filter,inv:'99'});
    assert.deepEqual(empty,{inv:'99',data:{}});
    assert.equal(urls.length,1);
    await assert.rejects(readShard('local-test',filter),{code:'RIEGO_INVALID_SHARD',httpStatus:503});
    assert.equal(urls.length,3);
  }finally{global.fetch=original;}
});
test('riego: el índice no admite duplicados, tipos extraños ni sobrescritura',async()=>{
  const old=global.fetch;
  try{
    for(const invalid of [['1A','1a'],[null,'2B'],{},['../secret']]){
      global.fetch=async()=>({ok:true,json:async()=>invalid});
      await assert.rejects(readShard('fixture',filter),{httpStatus:503});
    }
  }finally{global.fetch=old;}
});
test('riego: la lectura usa solo índice y shard del invernadero solicitado',async()=>{
  const old=global.fetch,paths=[];
  global.fetch=async(url,opts)=>{
    paths.push({url:String(url),method:opts.method,auth:opts.headers.Authorization});
    if(String(url).includes('v2-index'))return {ok:true,json:async()=>['1A','2B']};
    return {ok:true,json:async()=>({[toDay('2026-11-04')]:{1:'Riego'}})};
  };
  try{
    const shard=await readShard('token',filter);
    assert.equal(shard.inv,'1A');
    assert.equal(paths.length,2);
    assert.ok(paths[0].url.includes('lasala-riego-v2-index'));
    assert.ok(paths[1].url.includes('lasala-riego-v2-1A'));
    assert.equal(paths[1].auth,'Bearer token');
    assert.ok(paths.every(x=>x.method===undefined));
  }finally{global.fetch=old;}
});
test('riego: rechaza día corrupto y preserva límite de 400 filas',()=>{
  const day=toDay('2026-11-04');
  assert.throws(()=>buildReport({inv:'1A',data:{[day]:[]}},filter),{httpStatus:503});
  const all={};for(let i=1;i<=500;i++)all[i]={texto:'Válido'};
  const report=buildReport({inv:'1A',data:{[day]:all}},filter);
  assert.equal(report.totals.registros,500);
  assert.equal(report.totals.mostrados,400);
  assert.equal(report.rows.length,400);
});
