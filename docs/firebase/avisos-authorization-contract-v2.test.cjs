'use strict';
// §0.224 — Non-operational contract checks for the nine inventoried event families.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('./avisos-event-catalog-v2.json');
const expected={
 riego_hojas_marcadas:{fn:'marcarHojasMarcadas',calls:1},
 riego_hojas_corregidas:{fn:'avisarHojasCorregidas',calls:2},
 riego_validado_modificado:{fn:'saveRiegoInvPatch',calls:1},
 riego_propuesta_creada:{fn:'enviarPropuestaInminente',calls:1},
 riego_propuesta_aceptada:{fn:'aceptarPropuestaRiego',calls:1},
 riego_propuesta_aceptada_cambios:{fn:'cambiarYAceptarPropuestaRiego',calls:1},
 riego_propuesta_rechazada:{fn:'rechazarPropuestaRiego',calls:1},
 riego_problema_reportado:{fn:'enviarProblemaRiego',calls:1},
 riego_problema_resuelto:{fn:'guardarSolucionProblemaRiego',calls:1}
};
test('nine event families and ten active call sites are present',()=>{
 assert.equal(catalog.events.length,9);
 assert.equal(catalog.events.reduce((sum,e)=>sum+e.calls,0),10);
 assert.deepEqual(Object.fromEntries(catalog.events.map(e=>[e.id,{fn:e.function,calls:e.calls}])),expected);
});
for(const [id] of Object.entries(expected)){
 test(id+' documents source, actor, destination, scope and precondition',()=>{
  const item=catalog.events.find(e=>e.id===id);
  for(const key of ['actor','recipient','scope','source','precondition','evidence']){
   assert.ok(typeof item[key]==='string'&&item[key].trim().length>=8,key);
  }
  assert.equal(item.status,'PROVISIONAL');
 });
}
test('the legacy scheduler is independent of user-generated alerts',()=>{
 assert.equal(catalog.weeklyCron.key,'tuta_weekly');
 assert.equal(catalog.weeklyCron.scheduleUTC,'0 7 * * 4');
});
test('local task notification remains outside persistent alert events',()=>{
 assert.equal(catalog.localOnly.function,'avisarNuevasTareas');
 assert.ok(!catalog.events.some(e=>e.function==='avisarNuevasTareas'));
});
test('regante assignments have no unknown-user fallback in catalog',()=>{
 assert.deepEqual(catalog.reganteSalas,{REGANTE1:['sala1'],REGANTE2:['sala2'],REGANTE3:['sala3','sala4','sala5']});
});
test('the inventory is not an approved authorization policy',()=>{
 assert.equal(catalog.status,'PROVISIONAL_DESIGN_ONLY');
 assert.ok(catalog.events.every(e=>e.status==='PROVISIONAL'));
});
