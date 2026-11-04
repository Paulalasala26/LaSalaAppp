'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseOptions,render}=require('./admin-informes-export');
const DATE=new Date('2026-11-04T11:00:00.000Z');
const cases={
  qc:{scope:'registered-percentages',records:[{id:'ctrl-1',tipo:'carga',partida:'26X001',date:'2026-11-04',
    done:true,porcentajeInvalidasGlobal:30,enfermedades:{enfermedad1:10}}],totalRows:1},
  partidas:{source:'qc-registros',partidas:[{partida:'26X001',tunel:1,carga:2,
    registros:[{fecha:'2026-11-01'},{fecha:'2026-11-04'}]}],totals:{partidas:1}},
  plaguicidas:{source:'fito-v2',rows:[{fecha:'2026-11-04',calle:5,texto:'Tratamiento',tipoTrat:'Pistola'}],totals:{celdas:1}},
  especificos:{source:'especificos-v2',rows:[{fecha:'2026-11-04',calle:5,texto:'Específico',
    numeroVinculos:2,partidas:['26X001','26X002']}],totals:{celdas:1}},
  tareas:{source:'tareas-v1',rows:[{id:'t1',titulo:'Revisar',estado:'pendiente',origen:'manual'}],totals:{registros:1}},
  avisos:{source:'avisos-usuario-v1',rows:[{id:'a1',destinatario:'FRAN',titulo:'Aviso',leido:false}],totals:{avisos:1}},
  mantenimiento:{source:'mantenimiento-v1',rows:[{ticketId:'m1',tipoRegistro:'ejecucion',titulo:'Reparar'}],totals:{registros:1}}
};
test('opciones limitadas a secciones y formatos conocidos',()=>{
  assert.deepEqual(parseOptions({seccion:'qc',formato:'csv'}),{seccion:'qc',formato:'csv'});
  for(const q of [{seccion:'invalida',formato:'csv'},{seccion:'qc',formato:'pdf'},
    {seccion:['qc'],formato:'csv'},{seccion:'qc',formato:['html']},{}]){
    assert.throws(()=>parseOptions(q),{httpStatus:400});
  }
});
for(const [section,fixture] of Object.entries(cases)){
  test(section+': CSV e HTML usan proyección existente',()=>{
    const csv=render(section,'csv',fixture,{buscar:'prueba'},DATE);
    assert.match(csv.contentType,/csv/);
    assert.ok(csv.body.startsWith('\uFEFF'));
    assert.match(csv.body,/Registros mostrados/);
    assert.match(csv.filename,/2026-11-04.csv$/);
    assert.equal(csv.shown,1);
    assert.equal(csv.total,1);
    assert.equal(csv.partial,false);
    const html=render(section,'html',fixture,{},DATE);
    assert.match(html.contentType,/html/);
    assert.match(html.body,/<table>/);
    assert.match(html.body,/Imprimir del navegador/);
    assert.doesNotMatch(html.body,/<script/);
    assert.equal(html.partial,false);
  });
}
test('porcentaje QC guardado y enfermedad individual, sin scoring',()=>{
  const csv=render('qc','csv',cases.qc,{},DATE).body;
  assert.match(csv,/"30"/);
  assert.match(csv,/"10"/);
  assert.doesNotMatch(csv,/"Puntuación"|"Scoring"|"Media"/i);
});
test('partidas usa última fecha QC sin deducir stock',()=>{
  const csv=render('partidas','csv',cases.partidas,{},DATE).body;
  assert.match(csv,/"2026-11-04"/);
  assert.match(csv,/no constituyen inventario/);
});
test('neutraliza fórmulas y caracteres de control en CSV',()=>{
  const row={id:'=HYPERLINK("http://bad")',titulo:'\r\n+SUM(1,1)',estado:'@CMD'};
  const fixture={source:'tareas-v1',rows:[row],totals:{registros:1}};
  const csv=render('tareas','csv',fixture,{},DATE).body;
  assert.match(csv,/"'=HYPERLINK\(""http:\/\/bad""\)"/);
  assert.match(csv,/"'@CMD"/);
  assert.doesNotMatch(csv,/\r\n\+SUM/);
});
test('escapa HTML no confiable (XSS en valores y filtros)',()=>{
  const fixture={source:'tareas-v1',rows:[{titulo:'<img src=x onerror=alert(1)>',id:'1'}],totals:{registros:1}};
  const html=render('tareas','html',fixture,{buscar:'"><script>alert(1)</script>'},DATE).body;
  assert.doesNotMatch(html,/<img|<script/);
  assert.match(html,/&lt;img/);
  assert.match(html,/&lt;script&gt;/);
});
test('detecta límites de consulta de modo visible, sin prometer exportación completa',()=>{
  const fixture={source:'tareas-v1',rows:[{id:'1'}],totals:{registros:280}};
  const html=render('tareas','html',fixture,{},DATE);
  assert.equal(html.partial,true);
  assert.match(html.body,/1 de 280/);
  assert.match(html.body,/Informe parcial/);
});
test('rechaza fuentes y totales incoherentes',()=>{
  assert.throws(()=>render('tareas','csv',{...cases.tareas,source:'qc-registros'}, {}, DATE),
    {httpStatus:503});
  assert.throws(()=>render('tareas','csv',{...cases.tareas,totals:{registros:0}}, {},DATE),
    {httpStatus:503});
  assert.throws(()=>render('avisos','csv',{...cases.avisos,readonly:false}, {},DATE),
    {httpStatus:503});
});
test('retiene notas críticas de seguridad y semántica',()=>{
  assert.match(render('avisos','html',cases.avisos,{},DATE).body,/histórico completo/);
  assert.match(render('mantenimiento','html',cases.mantenimiento,{},DATE).body,/No activa recurrencias/);
  assert.match(render('plaguicidas','html',cases.plaguicidas,{},DATE).body,/No acreditan/);
});
