const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_ESPECIFICOS_ADMIN', password: 'e2e-only-password' };
const regante = { user: 'E2E_ESPECIFICOS_REGANTE', password: 'e2e-only-password' };
const tecnico = { user: 'E2E_ESPECIFICOS_TECNICO', password: 'e2e-only-password' };

function fixtureDatabase(){
  const hash=createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1':JSON.stringify({[login.user]:hash,[regante.user]:hash,[tecnico.user]:hash}),
    'lasala-roles-v1':JSON.stringify({[login.user]:'ADMIN',[regante.user]:'REGANTE',[tecnico.user]:'TECNICO'}),
    'lasala-especificos-v1':JSON.stringify({'17':{'30':{'18':'E2E-ESPECIFICO-INV17','17':'E2E-ESPECIFICO-DELETE'}},'18':{'30':{'18':'E2E-ESPECIFICO-INV18'}}})
  };
}

function readAt(object,path){return path.reduce((value,part)=>value==null?null:value[part],object)??null;}
function writeAt(object,path,value){
  let cursor=object;
  for(const part of path.slice(0,-1)){if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};cursor=cursor[part];}
  if(path.length){if(value===null)delete cursor[path.at(-1)];else cursor[path.at(-1)]=value;}
}
function firebaseEtag(value){return value==null?'null_etag':`"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;}
function specificsData(database){const value=database['lasala-especificos-v1'];return typeof value==='string'?JSON.parse(value):value;}
function textoEspecifico(database,dia,calle){const value=specificsData(database)?.['17']?.[dia]?.[calle];return value&&typeof value==='object'?value.texto:value;}


async function switchSpecificsUser(page,account){
  await page.evaluate(()=>doLogout());
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select,user)=>{
    if(![...select.options].some(option=>option.value===user))select.add(new Option(user,user));
  },account.user);
  await page.locator('#login-user').selectOption(account.user);
  await page.locator('#login-pass').fill(account.password);
  await page.getByRole('button',{name:'Iniciar sesión'}).click();
  await expect(page.locator('#app')).toBeVisible();
}

async function openSpecifics(page,database,{loginFirst=true,writeDelayMs=0,now='2026-06-30T10:00:00+02:00'}={}){
  const unexpectedHosts=[],writes=[];
  const corsHeaders={
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers':'Content-Type, If-Match, X-Firebase-ETag',
    'access-control-expose-headers':'ETag'
  };
  await page.route(firebaseUrl,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!==firebaseHost){unexpectedHosts.push(url.hostname);await route.abort();return;}
    const path=url.pathname.replace(/^\//,'').replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    const value=readAt(database,path);
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:corsHeaders});return;}
    if(request.method()==='GET'){
      const headers=request.headers()['x-firebase-etag']==='true'?{etag:firebaseEtag(value)}:{};
      await route.fulfill({status:200,contentType:'application/json',headers:{...corsHeaders,...headers},body:JSON.stringify(value)});return;
    }
    const body=request.postData()?JSON.parse(request.postData()):null;
    writes.push({path:path.join('/'),body});
    if(writeDelayMs)await new Promise(resolve=>setTimeout(resolve,writeDelayMs));
    const ifMatch=request.headers()['if-match'];
    if(ifMatch&&ifMatch!==firebaseEtag(readAt(database,path))){await route.fulfill({status:412,headers:corsHeaders,body:'{"error":"etag mismatch"}'});return;}
    if(request.method()==='PUT')writeAt(database,path,body);
    else if(request.method()==='PATCH')writeAt(database,path,{...(readAt(database,path)||{}),...body});
    else if(request.method()==='DELETE')writeAt(database,path,null);
    await route.fulfill({status:200,contentType:'application/json',headers:{...corsHeaders,etag:firebaseEtag(readAt(database,path))},body:JSON.stringify(body)});
  });
  await page.clock.setFixedTime(new Date(now));
  await page.goto('/');
  if(loginFirst){
    await page.locator('#login-user').evaluate((select,user)=>select.add(new Option(user,user)),login.user);
    await page.locator('#login-user').selectOption(login.user);
    await page.locator('#login-pass').fill(login.password);
    await page.getByRole('button',{name:'Iniciar sesión'}).click();
  }
  await expect(page.locator('#app')).toBeVisible();
  await page.evaluate(()=>showEspecificosModule());
  const overlay=page.locator('#especificos-overlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('[data-einv="17"]').click();
  return {overlay,unexpectedHosts,writes};
}

test('UAT-039: Específicos carga los datos del invernadero elegido',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-040 y UAT-041: editar un Específico lo conserva tras guardar y recargar',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const cell=page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="16"]');
  await cell.fill('E2E-ESPECIFICO-GUARDADO');await cell.press('Tab');
  await overlay.getByRole('button',{name:'Guardar'}).click();
  await expect.poll(()=>textoEspecifico(database,'30','16')).toBe('E2E-ESPECIFICO-GUARDADO');
  await page.reload();
  const reloaded=await openSpecifics(page,database,{loginFirst:false});
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="16"]')).toHaveValue('E2E-ESPECIFICO-GUARDADO');
  expect(unexpectedHosts).toEqual([]);expect(reloaded.unexpectedHosts).toEqual([]);
});

test('UAT-044: dos sesiones guardan tratamientos de Específicos en calles distintas',async({page,context})=>{
  const database=fixtureDatabase();
  const first=await openSpecifics(page,database,{writeDelayMs:120});
  await page.evaluate(()=>localStorage.setItem('lasala-sesion-v1',JSON.stringify({user:'E2E_ESPECIFICOS_ADMIN',ts:Date.now()})));
  const secondPage=await context.newPage();
  try{
    const second=await openSpecifics(secondPage,database,{loginFirst:false,writeDelayMs:120});
    for(const [target,street,value] of [[page,'16','E2E-ESPECIFICO-USUARIO1'],[secondPage,'15','E2E-ESPECIFICO-USUARIO2']]){
      const cell=target.locator(`#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="${street}"]`);
      await cell.fill(value);await cell.press('Tab');
    }
    await Promise.all([first.overlay.getByRole('button',{name:'Guardar'}).click(),second.overlay.getByRole('button',{name:'Guardar'}).click()]);
    await expect.poll(()=>first.writes.length+second.writes.length).toBeGreaterThanOrEqual(3);
    await expect.poll(()=>textoEspecifico(database,'30','16')).toBe('E2E-ESPECIFICO-USUARIO1');
    await expect.poll(()=>textoEspecifico(database,'30','15')).toBe('E2E-ESPECIFICO-USUARIO2');
    expect(first.unexpectedHosts).toEqual([]);expect(second.unexpectedHosts).toEqual([]);
  }finally{await secondPage.close();}
});

test('UAT-043: borrar un Específico de prueba no lo recupera al recargar',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const cell=page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="17"]');
  await expect(cell).toHaveValue('E2E-ESPECIFICO-DELETE');
  await cell.fill('');await cell.press('Tab');
  await overlay.getByRole('button',{name:'Guardar'}).click();
  await expect.poll(()=>specificsData(database)?.['17']?.['30']?.['17']).toBeUndefined();
  await page.reload();
  const reloaded=await openSpecifics(page,database,{loginFirst:false});
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="17"]')).toHaveValue('');
  expect(unexpectedHosts).toEqual([]);expect(reloaded.unexpectedHosts).toEqual([]);
});

test('UAT-2411: abrir Específicos directamente antes de Partidas deja operativos Cuadrícula y Resumen',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');
  await overlay.locator('button[onclick*="especificos-overlay"]').click();
  await expect(overlay).toBeHidden();

  const partidas=page.locator('#partidas-overlay');
  await page.getByTestId('home-partidas').click();
  await expect(partidas).toBeVisible();
  await partidas.getByRole('button',{name:'Sala 2',exact:true}).click();
  await partidas.getByRole('button',{name:'17',exact:true}).click();
  await partidas.getByRole('button',{name:'Resumen',exact:true}).click();
  const summary=page.locator('#especifico-resumen-overlay');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Resumen de Específicos');
  await expect(summary.locator('#resumen-especificos-quincena-bar')).toContainText('Quincena');
  expect(pageErrors).toEqual([]);
  expect(writes.every(write=>['lasala-conteo-tuta-invs-v1','lasala-conteo-trips-invs-v1'].includes(write.path))).toBe(true);
  expect(JSON.parse(database['lasala-especificos-v1'])).toEqual(JSON.parse(fixtureDatabase()['lasala-especificos-v1']));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2390: cambiar de ADMIN a REGANTE con Específicos abierto cierra las acciones de la sesión anterior',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');

  await page.evaluate(()=>doLogout());
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select,user)=>{
    if(![...select.options].some(option=>option.value===user))select.add(new Option(user,user));
  },regante.user);
  await page.locator('#login-user').selectOption(regante.user);
  await page.locator('#login-pass').fill(regante.password);
  await page.getByRole('button',{name:'Iniciar sesión'}).click();

  await expect(page.locator('#app')).toBeVisible();
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('home-especificos')).toBeHidden();
  await expect(page.locator('#especificos-grid-wrap')).toBeHidden();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2385: desde Partidas, abrir Específicos conserva la quincena futura y aplica permisos',async({page})=>{
  const database=fixtureDatabase();
  database['lasala-especificos-v1']=JSON.stringify({'17':{'45':{'18':'E2E-ESPECIFICO-FUTURO-INV17'}}});
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('button[onclick*="especificos-overlay"]').click();
  await page.getByTestId('home-partidas').click();
  const partidas=page.locator('#partidas-overlay');
  await expect(partidas).toBeVisible();
  await partidas.getByRole('button',{name:'Resumen',exact:true}).click();
  const summary=page.locator('#especifico-resumen-overlay');
  await expect(summary).toBeVisible();
  const period=summary.locator('#resumen-especificos-quincena-bar');
  await period.locator('button').last().click();
  const futureLabel=(await period.innerText()).split('·').at(-1).trim();
  await expect(summary).toContainText('E2E-ESPECIFICO-FUTURO-INV17');
  await summary.locator('button[onclick*="especifico-resumen-overlay"]').click();
  await partidas.getByRole('button',{name:/Cerrar/}).click();
  await page.getByTestId('home-especificos').click();
  const reopened=page.locator('#especificos-overlay');
  await expect(reopened.locator('#especificos-quincena-bar')).toContainText(futureLabel);
  await reopened.locator('button[data-einv="17"]').click();
  await expect(reopened.locator('#especificos-grid-wrap [data-einv="17"][data-edia="45"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-FUTURO-INV17');
  await reopened.locator('button[onclick*="especificos-overlay"]').click();

  await page.getByRole('button',{name:'Salir'}).click();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, regante.user);
  await page.locator('#login-user').selectOption(regante.user);
  await page.locator('#login-pass').fill(regante.password);
  await page.getByRole('button',{name:'Iniciar sesión'}).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.getByTestId('home-especificos')).toBeHidden();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1004–1008: cambiar de quincena en Específicos conserva el INV y vuelve al periodo exacto',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  const period=overlay.locator('#especificos-quincena-bar');
  const initial=(await period.innerText()).replace(/\\s+/g,' ').trim();

  await period.locator('button').last().click();
  const next=(await period.innerText()).replace(/\\s+/g,' ').trim();
  expect(next).not.toBe(initial);
  await expect(overlay.locator('#especificos-grid-wrap')).toBeVisible();
  await expect(overlay.locator('button[data-einv="17"]')).toBeVisible();

  await period.locator('button').first().click();
  await expect.poll(async()=> (await period.innerText()).replace(/\\s+/g,' ').trim()).toBe(initial);
  await period.locator('button').first().click();
  const previous=(await period.innerText()).replace(/\\s+/g,' ').trim();
  expect(previous).not.toBe(initial);
  await period.locator('button').last().click();
  await expect.poll(async()=> (await period.innerText()).replace(/\\s+/g,' ').trim()).toBe(initial);

  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1009: la navegación de quincena en Específicos cruza de año sin saltos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database,{now:'2026-12-31T10:00:00+01:00'});
  const period=overlay.locator('#especificos-quincena-bar');
  const yearEnd=(await period.innerText()).replace(/\\s+/g,' ').trim();

  await period.locator('button').last().click();
  const nextYear=(await period.innerText()).replace(/\\s+/g,' ').trim();
  expect(nextYear).not.toBe(yearEnd);
  expect(yearEnd.toLowerCase()).toContain('dic');
  expect(nextYear.toLowerCase()).toContain('ene');

  await period.locator('button').first().click();
  await expect.poll(async()=> (await period.innerText()).replace(/\\s+/g,' ').trim()).toBe(yearEnd);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-998, UAT-999, UAT-1001 y UAT-1003: Específicos cambia de INV sin mezclar datos y permite consultar uno vacío',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  const cell=(inv)=>page.locator(`#especificos-grid-wrap [data-einv="${inv}"][data-edia="30"][data-erc="18"]`);
  await expect(cell('17')).toHaveValue('E2E-ESPECIFICO-INV17');

  await overlay.locator('button[data-einv="18"]').last().click();
  await expect(cell('18')).toHaveValue('E2E-ESPECIFICO-INV18');
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"]')).toHaveCount(0);

  const options=await overlay.locator('button[data-einv]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.einv))]);
  const emptyInv=options.find(inv=>inv!=='17'&&inv!=='18');
  expect(emptyInv).toBeTruthy();
  await overlay.locator(`button[data-einv="${emptyInv}"]`).last().click();
  const visibleInvs=await page.locator('#especificos-grid-wrap [data-einv]').evaluateAll(nodes=>[...new Set(nodes.map(node=>node.dataset.einv))]);
  expect(visibleInvs).toEqual([emptyInv]);
  await expect(cell(emptyInv)).toHaveValue('');

  await overlay.locator('button[data-einv="17"]').last().click();
  await expect(cell('17')).toHaveValue('E2E-ESPECIFICO-INV17');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-984 y UAT-985: Específicos abre correctamente después de Partidas y Control',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('button[onclick*="especificos-overlay"]').click();

  const partidas=page.locator('#partidas-overlay');
  await page.getByTestId('home-partidas').click();
  await expect(partidas).toBeVisible();
  await partidas.getByRole('button',{name:'Sala 2',exact:true}).click();
  await partidas.getByRole('button',{name:'17',exact:true}).click();
  await partidas.getByRole('button',{name:/Cerrar/}).click();

  const control=page.locator('#control-overlay');
  await page.getByTestId('home-control').click();
  await expect(control).toBeVisible();
  await control.getByRole('button',{name:'✕ Cerrar'}).click();

  await page.getByTestId('home-especificos').click();
  const reopened=page.locator('#especificos-overlay');
  await expect(reopened).toBeVisible();
  await reopened.locator('button[data-einv="17"]').click();
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');

  expect(pageErrors).toEqual([]);
  expect(writes.every(write=>['lasala-conteo-tuta-invs-v1','lasala-conteo-trips-invs-v1'].includes(write.path))).toBe(true);
  expect(JSON.parse(database['lasala-especificos-v1'])).toEqual(fixtureDatabase()['lasala-especificos-v1'] && JSON.parse(fixtureDatabase()['lasala-especificos-v1']));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-986 y UAT-987: ADMIN y TÉCNICO pueden entrar en Específicos con sus permisos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await expect(page.getByTestId('home-especificos')).toBeVisible();
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');
  await overlay.locator('button[onclick*="especificos-overlay"]').click();

  await switchSpecificsUser(page,tecnico);
  await expect(page.getByTestId('home-especificos')).toBeVisible();
  await page.getByTestId('home-especificos').click();
  const techOverlay=page.locator('#especificos-overlay');
  await expect(techOverlay).toBeVisible();
  await techOverlay.locator('button[data-einv="17"]').click();
  await expect(page.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]')).toHaveValue('E2E-ESPECIFICO-INV17');

  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-988: un rol REGANTE no accede directamente a Específicos',async({page})=>{
  test.fail(true,'La ruta global showEspecificosModule no comprueba el rol antes de abrir el módulo.');
  const database=fixtureDatabase();
  const {unexpectedHosts,writes}=await openSpecifics(page,database);
  await switchSpecificsUser(page,regante);
  await page.evaluate(()=>showEspecificosModule());
  await expect(page.locator('#especificos-overlay')).toBeHidden();
  expect(writes.every(write=>write.path==='lasala-especificos-v1')).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-989: cabecera de Específicos es azul compacta e incluye imprimir y cerrar',async({page})=>{
  test.fail(true,'La implementación actual usa cabecera verde, aunque conserva imprimir y cerrar.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await expect(overlay.locator('button[onclick="showImprimirEspecificoSelector()"]')).toBeVisible();
  await expect(overlay.locator('button[onclick*="especificos-overlay"]')).toBeVisible();
  const color=await overlay.locator(':scope > div').first().evaluate(element=>getComputedStyle(element).backgroundColor);
  expect(color).toBe('rgb(21, 88, 160)');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-990: Específicos no muestra Añadir general en la cabecera',async({page})=>{
  test.fail(true,'La implementación actual todavía tiene Añadir manualmente en la cabecera.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await expect(overlay.locator('button[onclick="showEspecificoManualForm()"]')).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-991: Específicos no muestra Guardar general en la cabecera',async({page})=>{
  test.fail(true,'La implementación actual todavía tiene Guardar general en la cabecera.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await expect(overlay.locator('button[onclick="saveEspecificosData()"]')).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-992: Específicos permite alternar entre Cuadrícula y Resumen',async({page})=>{
  test.fail(true,'La pantalla actual de Específicos solo ofrece Cuadrícula; no presenta el cambio a Resumen.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const resumen=overlay.getByRole('button',{name:'Resumen',exact:true});
  await expect(resumen).toBeVisible();
  await resumen.click();
  await expect(overlay).toContainText('Resumen');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-993 y UAT-994: Específicos permanece utilizable en móvil y al reducir ventana de escritorio',async({page})=>{
  const database=fixtureDatabase();
  await page.setViewportSize({width:390,height:844});
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('button[data-einv="17"]')).toBeVisible();
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(mobileOverflow).toBe(false);

  await page.setViewportSize({width:1440,height:900});
  await page.setViewportSize({width:900,height:620});
  await expect(overlay.locator('button[onclick="showImprimirEspecificoSelector()"]')).toBeVisible();
  const desktopOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  expect(desktopOverflow).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1014: una pulsación en una celda vacía abre Añadir específico',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const empty=overlay.locator('#especificos-grid-wrap input[data-einv="17"][data-edia="29"][data-erc="18"]');
  await empty.click();
  await expect(page.locator('#especifico-manual-overlay')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1015, UAT-1019 y UAT-1032: una pulsación en una celda ocupada abre Editar y permite cancelar',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-especificos-v1'];
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const occupied=overlay.locator('#especificos-grid-wrap [data-einv="17"][data-edia="30"][data-erc="18"]').first();
  await occupied.click();
  const editor=page.locator('#especifico-manual-overlay');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Editar específico');
  await editor.locator('button[onclick*="especifico-manual-overlay"]').first().click();
  await expect(editor).toBeHidden();
  expect(database['lasala-especificos-v1']).toBe(original);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1016: la cuadrícula no acepta escritura directa',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const empty=overlay.locator('#especificos-grid-wrap input[data-einv="17"][data-edia="29"][data-erc="18"]');
  await empty.click();
  await empty.pressSequentially('E2E-DIRECTO');
  await expect(empty).toHaveValue('');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1017: pegar texto no altera una celda de Específicos sin formulario',async({page,context})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText('E2E-PEGADO'));
  const empty=overlay.locator('#especificos-grid-wrap input[data-einv="17"][data-edia="29"][data-erc="18"]');
  await empty.click();
  await empty.press('Control+V');
  await expect(empty).toHaveValue('');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1018: cerrar con X el formulario de alta conserva la cuadrícula sin guardar',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-especificos-v1'];
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  await expect(editor).toBeVisible();
  await editor.locator('button[onclick*="especifico-manual-overlay"]').first().click();
  await expect(editor).toBeHidden();
  expect(database['lasala-especificos-v1']).toBe(original);
  expect(writes.filter(write=>write.path==='lasala-especificos-v1')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1025–1027: la cuadrícula de Específicos conserva alineación al girar y desplazar en móvil',async({page})=>{
  const database=fixtureDatabase();
  await page.setViewportSize({width:390,height:844});
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const invButton=overlay.locator('button[data-einv="17"]').first();
  await invButton.click();
  const grid=overlay.locator('#especificos-grid-wrap');
  const cell='[data-einv="17"][data-edia="30"][data-erc="18"]';
  await expect(grid.locator(cell)).toHaveValue('E2E-ESPECIFICO-INV17');

  await grid.evaluate(el=>{el.scrollLeft=300;});
  const horizontal=await grid.evaluate(el=>{
    const input=el.querySelector('[data-einv="17"][data-edia="30"][data-erc="18"]');
    const cell=input?.closest('td');
    const head=[...el.querySelectorAll('tr:first-child td')].find(td=>td.textContent.trim()==='18');
    return {scrollLeft:el.scrollLeft,overflow:el.scrollWidth>el.clientWidth,delta:cell&&head?Math.abs(cell.getBoundingClientRect().left-head.getBoundingClientRect().left):null};
  });
  expect(horizontal.overflow).toBe(true);
  expect(horizontal.scrollLeft).toBeGreaterThan(0);
  expect(horizontal.delta).not.toBeNull();
  expect(horizontal.delta).toBeLessThan(2);

  await page.setViewportSize({width:844,height:390});
  await expect(grid.locator(cell)).toHaveValue('E2E-ESPECIFICO-INV17');
  await grid.evaluate(el=>{el.scrollTop=250;});
  const vertical=await grid.evaluate(el=>{
    const input=el.querySelector('[data-einv="17"][data-edia="30"][data-erc="18"]');
    const row=input?.closest('tr'),dayCell=row?.cells?.[0];
    return {scrollTop:el.scrollTop,overflow:el.scrollHeight>el.clientHeight,delta:row&&dayCell?Math.abs(row.getBoundingClientRect().top-dayCell.getBoundingClientRect().top):null};
  });
  expect(vertical.overflow).toBe(true);
  expect(vertical.scrollTop).toBeGreaterThan(0);
  expect(vertical.delta).not.toBeNull();
  expect(vertical.delta).toBeLessThan(2);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1028: volver de Resumen a Cuadrícula no hereda filtros indebidos',async({page})=>{
  test.fail(true,'El módulo actual de Específicos no ofrece la vista Resumen ni el cambio de vuelta a Cuadrícula.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openSpecifics(page,database);
  const resumen=overlay.getByRole('button',{name:'Resumen',exact:true});
  await expect(resumen).toBeVisible();
  await resumen.click();
  await expect(overlay.locator('#especificos-grid-wrap')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1031, UAT-1036, UAT-1037 y UAT-1038: alta desde calle muestra campos básicos de Específicos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('Añadir específico');
  for(const id of ['#esp-trat','#esp-dosis','#esp-horario','#esp-caldo']) await expect(editor.locator(id)).toBeVisible();
  const treatmentOptions=await editor.locator('#esp-trat option').count();
  expect(treatmentOptions).toBeGreaterThan(1);
  const [treatment,dose]=await Promise.all([
    editor.locator('#esp-trat').evaluate(el=>{const r=el.parentElement.getBoundingClientRect();return {x:r.x,y:r.y};}),
    editor.locator('#esp-dosis').evaluate(el=>{const r=el.parentElement.getBoundingClientRect();return {x:r.x,y:r.y};})
  ]);
  expect(Math.abs(treatment.y-dose.y)).toBeLessThan(3);
  expect(dose.x).toBeGreaterThan(treatment.x);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1033–1035: formulario desde calle fija la ubicación y no ofrece alcance global',async({page})=>{
  test.fail(true,'El formulario desde calle aún muestra selectores de sala/invernadero y modos globales.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  await expect(editor).toBeVisible();
  const observed=await editor.evaluate(element=>({
    fixedLocation:!element.querySelector('.esp-sala-chk,.esp-inv-chk')&&/INV\s*17/.test(element.innerText),
    roomSelectors:element.querySelectorAll('.esp-sala-chk,.esp-inv-chk').length,
    scopeModes:element.querySelectorAll('#esp-bulk-panels input[type="radio"]').length
  }));
  expect(observed).toEqual({fixedLocation:true,roomSelectors:0,scopeModes:0});
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1039–1042: selectores de Específicos conservan tratamiento y dosis elegidos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  const treatment=editor.locator('#esp-trat');
  for(const option of ['TC','MB','PP']){
    await treatment.selectOption(option);
    await expect(treatment).toHaveValue(option);
  }
  const dose=editor.locator('#esp-dosis');
  await expect(dose.locator('option')).toHaveText(['—','0.5','1','2','3']);
  await dose.selectOption('1');
  await expect(dose).toHaveValue('1');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-1058: botón Aplicar de alta queda alineado a la derecha',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  const alignment=await editor.evaluate(element=>{
    const apply=element.querySelector('button[onclick="saveEspecificoManual()"]');
    const footer=apply?.closest('div[style*="justify-content:space-between"]');
    if(!apply||!footer)return null;
    const rect=footer.getBoundingClientRect(),buttonRect=apply.getBoundingClientRect();
    return rect.right-buttonRect.right;
  });
  expect(alignment).not.toBeNull();
  expect(alignment).toBeLessThan(30);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-1060: formulario de alta no ofrece imprimir',async({page})=>{
  test.fail(true,'El formulario de alta aún muestra «Imprimir hoja».');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openSpecifics(page,database);
  await overlay.locator('#especificos-grid-wrap td[title="Pulsa para añadir un específico este día"]').first().click();
  const editor=page.locator('#especifico-manual-overlay');
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('button',{name:'Imprimir hoja'})).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});
