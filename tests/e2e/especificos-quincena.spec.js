const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_ESPECIFICOS_ADMIN', password: 'e2e-only-password' };
const regante = { user: 'E2E_ESPECIFICOS_REGANTE', password: 'e2e-only-password' };

function fixtureDatabase(){
  const hash=createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1':JSON.stringify({[login.user]:hash,[regante.user]:hash}),
    'lasala-roles-v1':JSON.stringify({[login.user]:'ADMIN',[regante.user]:'REGANTE'}),
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

async function openSpecifics(page,database,{loginFirst=true,writeDelayMs=0}={}){
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
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
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
  await page.locator('#login-user').selectOption(regante.user);
  await page.locator('#login-pass').fill(regante.password);
  await page.getByRole('button',{name:'Iniciar sesión'}).click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.getByTestId('home-especificos')).toBeHidden();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});
