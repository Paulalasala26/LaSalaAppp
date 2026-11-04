'use strict';
// Static guard for the production frontend's CURRENT alert senders.
// No network / no Firebase / no production API. Any new callsite requires explicit review.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const rows=html.split(/\r?\n/);
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'avisos-event-catalog-v2.json'),'utf8'));
function senderCalls(){
  let currentFunction=null;
  const found=[];
  for(let i=0;i<rows.length;i++){
    const line=rows[i], m=/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if(m)currentFunction=m[1];
    if(/^\s*\/\//.test(line)||/^(?:async\s+)?function\s+notificarUsuario\s*\(/.test(line))continue;
    if(/\bnotificarUsuario\s*\(/.test(line))found.push({line:i+1,fn:currentFunction});
  }
  return found;
}
const occurrences=(calls)=>calls.reduce((acc,hit)=>(acc[hit.fn]=(acc[hit.fn]||0)+1,acc),{});
test('inventory contains nine distinct event kinds and ten direct persistent alerts',()=>{
  assert.equal(catalog.schema,'lasala-alert-event-catalog/v1');
  assert.equal(catalog.status,'PROVISIONAL_DESIGN_ONLY');
  assert.equal(catalog.events.length,9);
  assert.equal(new Set(catalog.events.map(e=>e.id)).size,9);
  assert.equal(catalog.events.reduce((n,e)=>n+e.calls,0),10);
  assert.equal(catalog.countedDirectNotificarCalls,10);
});
test('ALL live direct notificarUsuario callsites have a mapped origin function',()=>{
  const actual=occurrences(senderCalls()),mapped={};
  for(const e of catalog.events){
    mapped[e.function]=(mapped[e.function]||0)+e.calls;
  }
  assert.deepEqual(actual,mapped,'New or removed alert callsite: update catalogue after security review');
});
test('each event declares a source, actor, destination and greenhouse scope',()=>{
  for(const e of catalog.events){
    assert.match(e.id,/^[a-z0-9_]+$/);
    assert.equal(e.status,'PROVISIONAL');
    for(const attr of ['actor','recipient','scope','source','precondition','evidence']){
      assert.equal(typeof e[attr],'string');
      assert.ok(e[attr].trim().length>=8,e.id+': '+attr);
    }
  }
});
test('all persistent alerts funnel through a single notifier and a single direct push call',()=>{
  const calls=rows.filter(line=>/\benviarPushA\s*\(/.test(line)&&!/^\s*\/\//.test(line));
  assert.equal(calls.length,2,'A new direct Worker POST bypass was introduced');
  assert.match(calls[0],/async function enviarPushA\(/);
  assert.match(calls[1],/enviarPushA\(target,tituloFinal,mensaje\)/);
  assert.ok(html.includes("const SEND_PUSH_URL = 'https://lasala-send-push.lasala-send-push.workers.dev'"));
});
test('local task notification stays distinct from persistent alert and from Push',()=>{
  const from=html.indexOf('async function avisarNuevasTareas('),to=html.indexOf('function pedirPermisoNotificaciones(',from);
  assert.ok(from>0&&to>from);
  const fn=html.slice(from,to);
  assert.ok(fn.includes('new Notification('));
  assert.ok(!fn.includes('notificarUsuario('));
  assert.ok(!fn.includes('enviarPushA('));
  assert.ok(html.includes('Aviso al técnico de guardia por ejecución de tareas de peón/regante'));
  assert.equal(catalog.localOnly.function,'avisarNuevasTareas');
});
test('regante greenhouse assignments match actual UI; backend must re-verify independently',()=>{
  assert.deepEqual(catalog.reganteSalas,{
    REGANTE1:['sala1'],REGANTE2:['sala2'],REGANTE3:['sala3','sala4','sala5']
  });
  assert.match(html,/REGANTE1:\['sala1'\], REGANTE2:\['sala2'\], REGANTE3:\['sala3','sala4','sala5'\]/);
  assert.ok(html.includes('function salaDeInv(invId)'));
  assert.ok(html.includes('function reganteDelaSala(invId)'));
});
test('proposals are persisted and show separate create/accept/change/reject paths',()=>{
  assert.ok(html.includes("const PROPUESTAS_RIEGO_KEY = 'lasala-propuestas-riego-v1'"));
  for(const name of ['enviarPropuestaInminente','aceptarPropuestaRiego',
    'cambiarYAceptarPropuestaRiego','rechazarPropuestaRiego'])
    assert.ok(html.includes('async function '+name+'('),name);
  assert.equal(catalog.events.filter(x=>x.id.startsWith('riego_propuesta_')).length,4);
});
test('execution problem chooses shift guard, and resolution notifies original reporter',()=>{
  assert.ok(html.includes('function tecnicoDeGuardia(fechaISO, turno)'));
  assert.ok(html.includes('function turnoActual()'));
  assert.ok(html.includes("const TECNICOS_TURNO_REF_LUNES_ISO = '2026-07-27'"));
  assert.ok(html.includes('const tecnico = tecnicoDeGuardia(fechaLocalISO(new Date()), turnoActual());'));
  assert.ok(html.includes('notificarUsuario(a.problemaData.reportadoPor,'));
});
test('validated irrigation warning is separate from general sync event',()=>{
  assert.ok(html.includes('async function publicarEventoRiego(invId, puntos, accion, avisoSupervisor)'));
  assert.ok(html.includes('cambiosSobreValidado.length>0'));
  assert.ok(html.includes("tipo:'cambio_riego_validado'"));
  assert.ok(catalog.events.some(e=>e.id==='riego_validado_modificado'));
});
test('weekly Tuta reminder is an independent Cron, not a browser callsite',()=>{
  assert.equal(catalog.weeklyCron.key,'tuta_weekly');
  assert.equal(catalog.weeklyCron.scheduleUTC,'0 7 * * 4');
  assert.equal(catalog.weeklyCron.status,'PRESERVAR SIN DUPLICAR');
  assert.ok(!senderCalls().some(x=>x.fn==='avisarNuevasTareas'));
});
