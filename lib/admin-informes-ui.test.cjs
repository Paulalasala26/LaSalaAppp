'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const pages=['index','historico','catalog','options','registros','control',
  'qc-dashboard','qc-criterios','qc-ficha','gs','partidas','plaguicidas',
  'especificos','tareas','avisos','mantenimiento','informes'];
const sections=['qc','partidas','plaguicidas','especificos','tareas','avisos','mantenimiento'];
test('la navegación ofrece Informes una sola vez en sus 17 pantallas',()=>{
  for(const name of pages){
    const page=read('admin/'+name+'.html');
    assert.equal((page.match(/href="\.\/informes\.html"/g)||[]).length,1,name);
    assert.equal((page.match(/<nav class="sidebar-nav"/g)||[]).length,1,name);
    const main=page.slice(page.indexOf('<nav class="sidebar-nav'),page.indexOf('</nav>')+6);
    const links=[...main.matchAll(/href="\.\/[^"]+"/g)].map(x=>x[0]);
    assert.equal(links.length,17,name);
    assert.equal(new Set(links).size,links.length,name);
    if(name==='informes'){
      assert.match(main,/<a class="nav-item selected" href="\.\/informes\.html" aria-current="page">/);
      assert.equal((main.match(/aria-current="page"/g)||[]).length,1);
    }
  }
});
test('informes es una pantalla administrativa independiente',()=>{
  const html=read('admin/informes.html');
  assert.match(html,/id="access-gate"/);
  assert.match(html,/id="workspace" hidden/);
  assert.match(html,/\.\/informes\.js/);
  assert.match(html,/id="inf-csv"/);
  assert.match(html,/id="inf-html"/);
  assert.match(html,/id="inf-file-link"/);
  assert.doesNotMatch(html,/onerror=|onload=|onclick=/);
  const inputIds=[...html.matchAll(/\bid="(inf-[\w-]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(inputIds).size,inputIds.length);
});
test('siete secciones y todos los filtros están disponibles',()=>{
  const html=read('admin/informes.html');
  const js=read('admin/informes.js');
  for(const key of sections){
    assert.match(html,new RegExp('<option value="'+key+'">'));
    assert.match(js,new RegExp('(?:^|\\W)'+key+':\\['));
  }
  for(const field of ['from','to','inv','qc-type','partida','alert-type',
    'vista','estado','origen','asignado','destinatario','buscar']){
    assert.match(html,new RegExp('id="inf-'+field+'"'));
  }
});
test('el navegador no accede directamente a RTDB ni introduce cambios',()=>{
  const js=read('admin/informes.js');
  assert.doesNotMatch(js,/firebasedatabase\.app|\.json\?auth=|method:\s*['"](?:PUT|PATCH|DELETE)['"]/i);
  assert.match(js,/modo:'informes'/);
  assert.match(js,/Authorization:'Bearer '/);
  assert.match(js,/admin-catalog/);
  assert.match(js,/URL\.revokeObjectURL/);
  assert.match(js,/x-report-partial/);
  assert.match(js,/NO_PERMISSION/);
  assert.match(js,/resp\.blob\(\)/);
});
test('las pantallas operativas siguen sin modificarse en esta función',()=>{
  const js=read('admin/informes.js');
  const html=read('admin/informes.html');
  assert.doesNotMatch(js+html,/<script.*src="\.\.\/assets\//);
  assert.match(html,/Informes e impresiones/);
});
