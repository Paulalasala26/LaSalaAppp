const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_FITO_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase(){
  const hash=createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1':JSON.stringify({[login.user]:hash}),
    'lasala-roles-v1':JSON.stringify({[login.user]:'ADMIN'}),
    'lasala-tareas-v1':'[]',
    'lasala-fito-v1':JSON.stringify({
      '17':{'29':{'2':'Tratamiento legado: azufre 1 g/l, revisión técnica'},'30':{'2':'E2E-FITO-INV17','3':{texto:'E2E-ORDEN 1 cc/l',caldoLitros:25,caldoLabel:'25L CUBA DE RUEDAS',tipoTrat:'Cañón',primerDia:true,esperaCarga:true,orden:4},'4':{texto:'E2E-HISTORICO-LECTURA 1 cc/l',caldoLitros:25,caldoLabel:'25L CUBA DE RUEDAS'},'5':{texto:'E2E-HISTORICO-SIN-DOSIS',caldoLitros:25,caldoLabel:'25L CUBA DE RUEDAS',tipoTrat:'Cañón'}},'32':{'2':'E2E-FITO-DELETE'},'45':{'3':'E2E-SERIE-CONTINUA 1 cc/l'}},
      '18':{'30':{'2':'E2E-FITO-INV18'}}
    })
  };
}

function readAt(object,path){ return path.reduce((value,part)=>value==null?null:value[part],object)??null; }
function writeAt(object,path,value){
  let cursor=object;
  for(const part of path.slice(0,-1)){ if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={}; cursor=cursor[part]; }
  if(path.length){ if(value===null)delete cursor[path.at(-1)]; else cursor[path.at(-1)]=value; }
}
function firebaseEtag(value){
  if(value==null)return 'null_etag';
  return `"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;
}
function fitoData(database){
  const value=database['lasala-fito-v1'];
  return typeof value==='string'?JSON.parse(value):value;
}
function textoFito(database,inv,dia,calle){
  const value=fitoData(database)?.[inv]?.[dia]?.[calle];
  return value&&typeof value==='object'?value.texto:value;
}

async function openFito(page,database,{user=login.user,loginFirst=true,writeDelayMs=0,selectINV=true,beforeOpen}={}){
  const unexpectedHosts=[],writes=[];
  const corsHeaders={
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers':'Content-Type, If-Match, X-Firebase-ETag',
    'access-control-expose-headers':'ETag'
  };
  await page.route(firebaseUrl,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!==firebaseHost){ unexpectedHosts.push(url.hostname); await route.abort(); return; }
    const path=url.pathname.replace(/^\//,'').replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    const value=readAt(database,path);
    if(request.method()==='OPTIONS'){ await route.fulfill({status:204,headers:corsHeaders}); return; }
    if(request.method()==='GET'){
      const headers=request.headers()['x-firebase-etag']==='true'?{etag:firebaseEtag(value)}:{};
      await route.fulfill({status:200,contentType:'application/json',headers:{...corsHeaders,...headers},body:JSON.stringify(value)});
      return;
    }
    const body=request.postData()?JSON.parse(request.postData()):null;
    writes.push({method:request.method(),path:path.join('/'),body});
    if(writeDelayMs)await new Promise(resolve=>setTimeout(resolve,writeDelayMs));
    const ifMatch=request.headers()['if-match'];
    if(ifMatch&&ifMatch!==firebaseEtag(readAt(database,path))){
      await route.fulfill({status:412,contentType:'application/json',headers:corsHeaders,body:JSON.stringify({error:'etag mismatch'})});
      return;
    }
    if(request.method()==='PUT')writeAt(database,path,body);
    else if(request.method()==='PATCH')writeAt(database,path,{...(readAt(database,path)||{}),...body});
    else if(request.method()==='DELETE')writeAt(database,path,null);
    await route.fulfill({status:200,contentType:'application/json',headers:{...corsHeaders,etag:firebaseEtag(readAt(database,path))},body:JSON.stringify(body)});
  });
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  if(loginFirst){
    await page.locator('#login-user').evaluate((select,name)=>select.add(new Option(name,name)),user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(login.password);
    await page.getByRole('button',{name:'Iniciar sesión'}).click();
  }
  await expect(page.locator('#app')).toBeVisible();
  if(beforeOpen)await beforeOpen(page);
  await page.locator(".home-shortcut-card[onclick=\"handleQuickAction('plaguicidas')\"]").click();
  const overlay=page.locator('#fito-overlay');
  await expect(overlay).toBeVisible();
  if(selectINV)await overlay.locator('[data-finv="17"]').click();
  return {overlay,unexpectedHosts,writes};
}



test('UAT-469: Inicio ofrece Registrar y Consultar tratamientos antes de abrir Plaguicidas',async({page})=>{
  test.fail(true,'El módulo actual abre directamente la cuadrícula/selector y no muestra estas dos opciones del caso QC.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database,{selectINV:false,beforeOpen:async app=>{
    await expect(app.getByText('Registrar tratamientos',{exact:true})).toBeVisible();
    await expect(app.getByText('Consultar tratamientos',{exact:true})).toBeVisible();
  }});
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-470 y UAT-471: otros módulos funcionan antes de la primera carga de Plaguicidas',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database,{beforeOpen:async app=>{
    const partidas=app.locator('#partidas-overlay');
    await app.getByTestId('home-partidas').click();
    await expect(partidas).toBeVisible();
    await partidas.getByRole('button',{name:/Cerrar/}).click();

    const control=app.locator('#control-overlay');
    await app.getByTestId('home-control').click();
    await expect(control).toBeVisible();
    await control.getByRole('button',{name:'✕ Cerrar'}).click();
  }});
  await expect(overlay).toBeVisible();
  await expect(page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="2"]')).toHaveValue('E2E-FITO-INV17');
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-472 y UAT-477: cerrar Plaguicidas y volver a abrirlo no duplica vistas ni registros',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.locator('#fito-btn-retroceder').click();
  await expect(overlay).toBeVisible();
  await overlay.locator('button[onclick*="fito-overlay"]').click();
  await expect(overlay).toBeHidden();

  await page.locator(".home-shortcut-card[onclick=\"handleQuickAction('plaguicidas')\"]").click();
  await expect(overlay).toBeVisible();
  await overlay.locator('[data-finv="17"]').click();
  await expect(page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="2"]')).toHaveValue('E2E-FITO-INV17');
  await expect(page.locator('#fito-overlay')).toHaveCount(1);
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes.filter(write=>write.path==='lasala-fito-v1')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-481: Registrar sin INV muestra los selectores de Sala e invernadero',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database,{selectINV:false});
  await expect(overlay.locator('[data-finv="17"]')).toBeVisible();
  await expect(overlay.locator('#fito-grid-wrap')).toContainText('Sala');
  expect(unexpectedHosts).toEqual([]);
});

async function completarFitoValido(form,producto='E2E-TRAMO'){
  await form.locator('#fm-trat').fill(producto);
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
}

test('UAT-033: abrir Plaguicidas muestra datos cargados del invernadero elegido',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await expect(page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="2"]')).toHaveValue('E2E-FITO-INV17');
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-034: modificar una celda de Plaguicidas y guardar persiste el cambio',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  const cell=page.locator('#fito-grid-wrap input[data-finv="17"][data-fdia="32"][data-frc="3"]');
  await cell.fill('E2E-FITO-GUARDADO');
  await cell.press('Tab');
  await overlay.getByRole('button',{name:'Guardar'}).click();
  await expect.poll(()=>textoFito(database,'17','32','3')).toBe('E2E-FITO-GUARDADO');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-035: el dato guardado de Plaguicidas permanece después de recargar',async({page})=>{
  const database=fixtureDatabase();
  const {overlay}=await openFito(page,database);
  const cell=page.locator('#fito-grid-wrap input[data-finv="17"][data-fdia="32"][data-frc="3"]');
  await cell.fill('E2E-FITO-RECARGA');
  await cell.press('Tab');
  await overlay.getByRole('button',{name:'Guardar'}).click();
  await expect.poll(()=>textoFito(database,'17','32','3')).toBe('E2E-FITO-RECARGA');
  await page.reload();
  const reloaded=await openFito(page,database,{loginFirst:false});
  await expect(page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="32"][data-frc="3"]')).toHaveValue('E2E-FITO-RECARGA');
  expect(reloaded.unexpectedHosts).toEqual([]);
});

test('UAT-036: cambiar de invernadero en Plaguicidas muestra solo sus propios datos',async({page})=>{
  const database=fixtureDatabase();
  const {unexpectedHosts}=await openFito(page,database);
  await page.locator('#fito-overlay [data-finv="18"]').click();
  const grid=page.locator('#fito-grid-wrap');
  await expect(grid).toContainText('E2E-FITO-INV18');
  await expect(grid).not.toContainText('E2E-FITO-INV17');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-484–485: Plaguicidas cambia de quincena sin perder el invernadero y respeta el límite anterior',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  const label=overlay.locator('#fito-quincena-bar span');
  const previous=overlay.locator('#fito-quincena-bar button').first();
  const next=overlay.locator('#fito-quincena-bar button').last();
  const grid=overlay.locator('#fito-grid-wrap');
  const initialLabel=await label.textContent();
  await expect(grid).toContainText('INV.17');

  await next.click();
  await expect(label).not.toHaveText(initialLabel);
  await expect(grid).toContainText('INV.17');
  await previous.click();
  await expect(label).toHaveText(initialLabel);

  let previousSteps=0;
  while(!(await previous.isDisabled()) && previousSteps<12){
    await previous.click();
    previousSteps++;
  }
  await expect(previous).toBeDisabled();
  expect(previousSteps).toBeGreaterThan(0);
  const earliestLabel=await label.textContent();
  await expect(label).toHaveText(earliestLabel);
  await next.click();
  await expect(label).not.toHaveText(earliestLabel);
  await expect(grid).toContainText('INV.17');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2384: Plaguicidas lee la continuidad entre quincenas sin completar jornadas vacías',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const grid=overlay.locator('#fito-grid-wrap');
  await expect(grid.locator('[data-finv="17"][data-fdia="30"][data-frc="2"]')).toHaveValue('E2E-FITO-INV17');

  await overlay.locator('#fito-quincena-bar button').last().click();
  await expect(grid.locator('[data-finv="17"][data-fdia="45"][data-frc="3"]')).toHaveValue('E2E-SERIE-CONTINUA 1 cc/l');
  await expect(grid.locator('[data-finv="17"][data-fdia="44"][data-frc="3"]')).toHaveValue('');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-486: Plaguicidas conserva la correspondencia entre fecha, día de semana y ficha al cambiar de quincena',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const label=overlay.locator('#fito-quincena-bar span');
  const initial=await label.textContent();
  await overlay.locator('#fito-quincena-bar button').last().click();
  await expect(label).not.toHaveText(initial);

  const row=page.locator('#fito-grid-wrap tr').filter({has:page.locator('td[onclick^="abrirFitoManualDia"]')}).first();
  const dayCell=row.locator('td[onclick^="abrirFitoManualDia"]').first();
  const weekday=(await row.locator('td').last().textContent()).trim();
  const day=Number((await dayCell.getAttribute('onclick')).match(/,(\d+)\)/)[1]);
  await dayCell.click();

  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('#fm-dia')).toHaveValue(String(day));
  await expect(form.locator(`#fm-dia option[value="${day}"]`)).toContainText(weekday);
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test.describe('Interacción móvil de Plaguicidas',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true});
  test('UAT-493: varios toques rápidos en Plaguicidas no apilan fichas en móvil',async({page})=>{
    const database=fixtureDatabase();
    const {overlay,unexpectedHosts,writes}=await openFito(page,database);
    const dayCell=overlay.locator('#fito-grid-wrap td[onclick^="abrirFitoManualDia"]').first();
    await dayCell.scrollIntoViewIfNeeded();
    const box=await dayCell.boundingBox();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    const form=page.locator('#fito-manual-overlay');
    await expect(form).toBeVisible();
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    expect(await page.locator('#fito-manual-overlay').count()).toBe(1);
    expect(unexpectedHosts).toEqual([]);
    expect(writes).toEqual([]);
  });
});

test('UAT-495: Plaguicidas muestra el texto legado sin reconvertirlo al abrir',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await expect(page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="29"][data-frc="2"]')).toHaveValue('Tratamiento legado: azufre 1 g/l, revisión técnica');
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-513: cancelar una ficha de Plaguicidas descarta cambios sin guardar',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  await form.locator('#fm-trat').fill('E2E-CANCELADO');
  await form.locator('#fm-dosis').fill('9 cc/l');
  await form.getByRole('button',{name:'Cancelar'}).click();
  await expect(form).toBeHidden();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-516: una validación fallida en Plaguicidas mantiene la ficha y no escribe',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText('Introduce el producto')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-496, UAT-497, UAT-498 y UAT-514: la ficha ordena método y caldo y presenta Guardar',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  const body=(await form.innerText()).toLocaleLowerCase('es');
  expect(body).toContain('dónde y cuándo');
  expect(body).toContain('método y tratamiento');
  expect(body).toContain('horario');
  expect(body).toContain('opciones por invernadero');
  expect(body.indexOf('cómo se aplica')).toBeLessThan(body.indexOf('mezclas predeterminadas'));
  expect(body.indexOf('dosis')).toBeLessThan(body.indexOf('caldo (litros)'));
  await expect(form.locator('#fm-tipo-trat')).toHaveCount(1);
  await expect(form.locator('#fm-caldo')).toHaveCount(1);
  await expect(form.getByRole('button',{name:'Guardar'})).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-517–UAT-520: editar una mezcla predeterminada limpia su selección y conserva el texto manual',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  const mezcla=form.locator('#fm-mezcla');
  const tratamiento=form.locator('#fm-trat');
  const dosis=form.locator('#fm-dosis');

  await mezcla.selectOption({label:'ORTIVA TOP 1cc/L'});
  await expect(tratamiento).toHaveValue('ORTIVA TOP 1cc/L');
  await expect(dosis).toHaveValue('');
  await expect(mezcla).toHaveValue('ORTIVA TOP 1cc/L');

  await tratamiento.fill('E2E MEZCLA EDITADA');
  await expect(tratamiento).toHaveValue('E2E MEZCLA EDITADA');
  await expect(mezcla).toHaveValue('');

  await mezcla.selectOption({label:'ORTIVA TOP 1cc/L'});
  await dosis.fill('2 cc/l');
  await expect(dosis).toHaveValue('2 cc/l');
  await expect(mezcla).toHaveValue('');

  await mezcla.selectOption({label:'CUPRIK 5gr/L'});
  await expect(tratamiento).toHaveValue('CUPRIK 5gr/L');
  await expect(dosis).toHaveValue('');
  await expect(mezcla).toHaveValue('CUPRIK 5gr/L');
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-521: dos jornadas con la misma mezcla conservan horarios independientes',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  for(const [day,hour] of [['30','17:00'],['31','20:00']]){
    await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
    const form=page.locator('#fito-manual-overlay');
    await form.locator('#fm-dia').selectOption(day);
    await form.locator('#fm-trat').fill('E2E-MEZCLA-HORARIO');
    await form.locator('#fm-dosis').fill('1 cc/l');
    await form.locator('#fm-tipo-trat').selectOption('Cañón');
    await form.locator('#fm-caldo').selectOption('25');
    await form.locator('#fm-horario').selectOption(hour);
    await form.getByRole('button',{name:'Guardar'}).click();
    await expect(form).toBeHidden();
  }
  const fito=fitoData(database);
  expect(fito?.['17']?.['30']?.['2']?.texto).toBe('E2E-MEZCLA-HORARIO 1 cc/l 17:00');
  expect(fito?.['17']?.['31']?.['2']?.texto).toBe('E2E-MEZCLA-HORARIO 1 cc/l 20:00');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-525: editar un tratamiento restaura y conserva orden, espera y primer día',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  const cell=overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="3"]');
  await cell.dblclick();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  const panel=form.locator('#fm-bulk-panels');
  const firstDay=panel.getByLabel('Primer día de tratamiento (marca la celda en morado)');
  const waitLoad=panel.getByLabel(/Esperar a la carga/);
  const order=panel.locator('input[type="number"]');
  await expect(firstDay).toBeChecked();
  await expect(waitLoad).toBeChecked();
  await expect(order).toHaveValue('4');

  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['3']).toMatchObject({
    texto:'E2E-ORDEN 1 cc/l',primerDia:true,esperaCarga:true,orden:4
  });
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-526: consultar una jornada histórica incompleta no la completa ni la reescribe',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const cell=overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="4"]');
  await cell.dblclick();
  const form=page.locator('#fito-manual-overlay');
  await expect(form.locator('#fm-trat')).toHaveValue('E2E-HISTORICO-LECTURA');
  await expect(form.locator('#fm-dosis')).toHaveValue('1 cc/l');
  await expect(form.locator('#fm-tipo-trat')).toHaveValue('');
  await expect(form.locator('#fm-caldo')).toHaveValue('25');
  await form.getByRole('button',{name:'Cancelar'}).click();
  await expect(form).toBeHidden();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-527: no imprime jornadas históricas incompletas ni abre un parte engañoso',async({page,context})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const form=page.locator('#fito-manual-overlay');
  await overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="5"]').dblclick();
  await form.getByRole('button',{name:'Imprimir hoja'}).click();
  await expect(page.getByText('Introduce la dosis antes de imprimir')).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await form.getByRole('button',{name:'Cancelar'}).click();

  await overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="4"]').dblclick();
  await form.getByRole('button',{name:'Imprimir hoja'}).click();
  await expect(page.getByText('Indica si el tratamiento es con Pistola o con Cañón')).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-528: abrir el alta desde el día mantiene solo el INV de origen seleccionado',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const dia=overlay.locator('#fito-grid-wrap td[onclick^="abrirFitoManualDia"]').first();
  await dia.click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('.fm-inv-chk:checked')).toHaveCount(1);
  await expect(form.locator('.fm-inv-chk[value="17"]')).toBeChecked();
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-529: seleccionar otro INV de la misma sala mantiene los dos objetivos visibles',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="18"]').check();
  await expect(form.locator('.fm-inv-chk:checked')).toHaveCount(2);
  await expect(form.locator('.fm-inv-chk[value="17"]')).toBeChecked();
  await expect(form.locator('#fm-bulk-panels')).toContainText('INV 17');
  await expect(form.locator('#fm-bulk-panels')).toContainText('INV 18');
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-530: Cañón conserva los invernaderos elegidos al alternar entre salas',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="31"]').check();
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await expect(form.locator('.fm-inv-chk[value="17"]')).toBeChecked();
  await expect(form.locator('.fm-inv-chk[value="31"]')).toBeChecked();
  await expect(form.locator('#fm-bulk-panels')).toContainText('INV 17');
  await expect(form.locator('#fm-bulk-panels')).toContainText('INV 31');
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-531: Pistola impide una selección que cruza salas y no crea tratamientos ni tareas',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="31"]').check();
  await form.locator('#fm-trat').fill('E2E-PISTOLA-SALAS');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Pistola');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText('Con Pistola, selecciona invernaderos de una sola sala para asignar el PEÓN correcto')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-532: Toda la sala selecciona sus INV reales y deja fuera las demás salas',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="17"]').uncheck();
  const sala1=form.locator('.fm-sala-chk[data-sala="sala1"]');
  await sala1.check();
  const seleccionados=await form.locator('.fm-inv-chk:checked').evaluateAll(inputs=>inputs.map(input=>input.value).sort());
  const sala1Ids=await form.locator('.fm-inv-chk[data-sala="sala1"]').evaluateAll(inputs=>inputs.map(input=>input.value).sort());
  expect(seleccionados).toEqual(sala1Ids);
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-533: desmarcar una sala no elimina los invernaderos de otra sala',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  const sala1=form.locator('.fm-sala-chk[data-sala="sala1"]');
  const sala2=form.locator('.fm-sala-chk[data-sala="sala2"]');
  await sala1.check();
  await sala2.check();
  await sala1.uncheck();
  const seleccionados=await form.locator('.fm-inv-chk:checked').evaluateAll(inputs=>inputs.map(input=>input.value).sort());
  const sala2Ids=await form.locator('.fm-inv-chk[data-sala="sala2"]').evaluateAll(inputs=>inputs.map(input=>input.value).sort());
  expect(seleccionados).toEqual(sala2Ids);
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-534: Entero aplica el tratamiento solo a las calles reales del INV elegido',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await completarFitoValido(form,'E2E-ENTERO');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>Object.entries(fitoData(database)?.['17']?.['30']||{}).filter(([,raw])=>raw?.texto==='E2E-ENTERO 1 cc/l').map(([calle])=>Number(calle)).sort((a,b)=>a-b)).toEqual(Array.from({length:36},(_,i)=>i+1));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-535: Entero menos excluye solo las calles indicadas',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(1).check();
  const excluidas=form.locator('#fm-bulk-detalle-17 select');
  await excluidas.nth(0).selectOption('2');
  await excluidas.nth(1).selectOption('4');
  await completarFitoValido(form,'E2E-ENTERO-MENOS');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>Object.entries(fitoData(database)?.['17']?.['30']||{}).filter(([,raw])=>raw?.texto==='E2E-ENTERO-MENOS 1 cc/l').map(([calle])=>Number(calle)).sort((a,b)=>a-b)).toEqual(Array.from({length:36},(_,i)=>i+1).filter(c=>c<2||c>4));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-536: un tramo válido guarda exactamente desde y hasta inclusive',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  await form.locator('#fm-bulk-detalle-17 .fm-bulk-tramo-desde').selectOption('2');
  await form.locator('#fm-bulk-detalle-17 .fm-bulk-tramo-hasta').selectOption('4');
  await completarFitoValido(form,'E2E-TRAMO-VALIDO');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  const expected=[2,3,4];
  await expect.poll(()=>Object.entries(fitoData(database)?.['17']?.['30']||{}).filter(([,raw])=>raw?.texto==='E2E-TRAMO-VALIDO 1 cc/l').map(([calle])=>Number(calle)).sort((a,b)=>a-b)).toEqual(expected);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-537: dos tramos discontinuos dejan intactas las calles intermedias',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  const rows=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row');
  await rows.nth(0).locator('.fm-bulk-tramo-desde').selectOption('2');
  await rows.nth(0).locator('.fm-bulk-tramo-hasta').selectOption('3');
  await form.getByRole('button',{name:'+ Añadir tramo'}).click();
  const second=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row').nth(1);
  await second.locator('.fm-bulk-tramo-desde').selectOption('7');
  await second.locator('.fm-bulk-tramo-hasta').selectOption('8');
  await completarFitoValido(form,'E2E-DOS-TRAMOS');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>Object.entries(fitoData(database)?.['17']?.['30']||{}).filter(([,raw])=>raw?.texto==='E2E-DOS-TRAMOS 1 cc/l').map(([calle])=>Number(calle)).sort((a,b)=>a-b)).toEqual([2,3,7,8]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-539: un tramo invertido se rechaza sin escribir',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  await form.locator('#fm-bulk-detalle-17 .fm-bulk-tramo-desde').selectOption('4');
  await form.locator('#fm-bulk-detalle-17 .fm-bulk-tramo-hasta').selectOption('2');
  await completarFitoValido(form,'E2E-TRAMO-INVERTIDO');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText('El tramo del INV 17 termina antes de empezar')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-540: tramos solapados compatibles guardan cada calle una sola vez',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  const rows=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row');
  await rows.nth(0).locator('.fm-bulk-tramo-desde').selectOption('2');
  await rows.nth(0).locator('.fm-bulk-tramo-hasta').selectOption('4');
  await rows.nth(0).locator('.fm-bulk-tramo-obs').fill('sin daño');
  await form.getByRole('button',{name:'+ Añadir tramo'}).click();
  const second=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row').nth(1);
  await second.locator('.fm-bulk-tramo-desde').selectOption('3');
  await second.locator('.fm-bulk-tramo-hasta').selectOption('5');
  await second.locator('.fm-bulk-tramo-obs').fill('sin daño');
  await completarFitoValido(form,'E2E-SOLAPE-COMPATIBLE');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>Object.entries(fitoData(database)?.['17']?.['30']||{}).filter(([,raw])=>raw?.texto?.startsWith('E2E-SOLAPE-COMPATIBLE')).map(([calle])=>Number(calle)).sort((a,b)=>a-b)).toEqual([2,3,4,5]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-541: tramos solapados con observaciones distintas se bloquean antes de guardar',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  const rows=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row');
  await rows.nth(0).locator('.fm-bulk-tramo-desde').selectOption('2');
  await rows.nth(0).locator('.fm-bulk-tramo-hasta').selectOption('4');
  await rows.nth(0).locator('.fm-bulk-tramo-obs').fill('observacion A');
  await form.getByRole('button',{name:'+ Añadir tramo'}).click();
  const second=form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-row').nth(1);
  await second.locator('.fm-bulk-tramo-desde').selectOption('3');
  await second.locator('.fm-bulk-tramo-hasta').selectOption('5');
  await second.locator('.fm-bulk-tramo-obs').fill('observacion B');
  await completarFitoValido(form,'E2E-SOLAPE-CONFLICTIVO');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText('Los tramos solapados del INV 17 tienen observaciones distintas')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-548: guardar sin calles efectivas no escribe una jornada vacía',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(1).check();
  const excluidas=form.locator('#fm-bulk-detalle-17 select');
  await excluidas.nth(0).selectOption('1');
  await excluidas.nth(1).selectOption('36');
  await completarFitoValido(form,'E2E-SIN-CALLES');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText('Selecciona calles efectivas para el INV 17')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-542: cambiar la selección de salas conserva los tramos preparados',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-desde').selectOption('2');
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-hasta').selectOption('4');
  await form.locator('.fm-inv-chk[value="31"]').check();
  await expect(form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-desde')).toHaveValue('2');
  await expect(form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-hasta')).toHaveValue('4');
  await expect(form.locator('.fm-inv-chk[value="17"]')).toBeChecked();
  await expect(form.locator('.fm-inv-chk[value="31"]')).toBeChecked();
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-543: quitar un INV conserva los tramos del resto de la selección',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="31"]').check();
  await form.locator('input[name="fm-bulk-modo-31"]').nth(2).check();
  await form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-desde').selectOption('4');
  await form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-hasta').selectOption('6');
  await form.locator('.fm-inv-chk[value="17"]').uncheck();
  await expect(form.locator('.fm-inv-chk:checked')).toHaveCount(1);
  await expect(form.locator('.fm-inv-chk[value="31"]')).toBeChecked();
  await expect(form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-desde')).toHaveValue('4');
  await expect(form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-hasta')).toHaveValue('6');
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-512 y UAT-544: guardar y reabrir observaciones las asocia a su INV y tramo',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('.fm-inv-chk[value="31"]').check();
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-desde').selectOption('2');
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-hasta').selectOption('3');
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-obs').fill('observación de INV17');
  await form.locator('input[name="fm-bulk-modo-31"]').nth(2).check();
  await form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-desde').selectOption('4');
  await form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-hasta').selectOption('5');
  await form.locator('#fm-bulk-tramos-31 .fm-bulk-tramo-obs').fill('observación de INV31');
  await completarFitoValido(form,'E2E-OBS-POR-INV');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['2']?.texto).toBe('E2E-OBS-POR-INV 1 cc/l — observación de INV17');
  await expect.poll(()=>fitoData(database)?.['31']?.['30']?.['4']?.texto).toBe('E2E-OBS-POR-INV 1 cc/l — observación de INV31');
  const cell=overlay.locator('#fito-grid-wrap input[data-finv="17"][data-fdia="30"]').first();
  await expect(cell).toBeVisible();
  await cell.dblclick();
  const editor=page.locator('#fito-manual-overlay');
  await expect(editor.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-obs')).toHaveValue('observación de INV17');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-546: no solapar Plaguicidas con un Específico de tarde ni alterar registros',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  database['lasala-especificos-v1']=JSON.stringify({'17':{'30':{'2':'E2E-ESPECIFICO POR LA TARDE'}}});
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await completarFitoValido(form,'E2E-TRATAMIENTO-CONFLICTIVO');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  await expect(page.getByText(/No se puede aplicar Plaguicidas por la tarde si ya hay otro tratamiento por la tarde/)).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-549: una jornada de una calle no crea datos en otras fechas o invernaderos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('input[name="fm-bulk-modo-17"]').nth(2).check();
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-desde').selectOption('6');
  await form.locator('#fm-bulk-tramos-17 .fm-bulk-tramo-hasta').selectOption('6');
  await completarFitoValido(form,'E2E-UNA-CALLE');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['6']?.texto).toBe('E2E-UNA-CALLE 1 cc/l');
  expect(fitoData(database)?.['17']?.['31']?.['6']).toBeUndefined();
  expect(fitoData(database)?.['31']?.['30']).toBeUndefined();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-522: dos jornadas con el mismo producto conservan litros de caldo independientes',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  for(const [day,caldo] of [['30','25'],['31','50']]){
    await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
    const form=page.locator('#fito-manual-overlay');
    await form.locator('#fm-dia').selectOption(day);
    await form.locator('#fm-trat').fill('E2E-MISMO-PRODUCTO');
    await form.locator('#fm-dosis').fill('1 cc/l');
    await form.locator('#fm-tipo-trat').selectOption('Cañón');
    await form.locator('#fm-caldo').selectOption(caldo);
    await form.getByRole('button',{name:'Guardar'}).click();
    await expect(form).toBeHidden();
  }
  const fito=fitoData(database);
  expect(fito?.['17']?.['30']?.['2']).toMatchObject({texto:'E2E-MISMO-PRODUCTO 1 cc/l',caldoLitros:25});
  expect(fito?.['17']?.['31']?.['2']).toMatchObject({texto:'E2E-MISMO-PRODUCTO 1 cc/l',caldoLitros:50});
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-523: cambiar de Pistola a Cañón antes de guardar no asigna una tarea de PEÓN',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-CAMBIO-METODO');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Pistola');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['2']).toMatchObject({tipoTrat:'Cañón'});
  await expect.poll(()=>JSON.parse(database['lasala-tareas-v1']||'[]').filter(t=>t.categoria==='fumigacion')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-524: cambiar de Cañón a Pistola antes de guardar asigna el PEÓN de la sala',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-CAMBIO-METODO');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-tipo-trat').selectOption('Pistola');
  await form.locator('#fm-caldo').selectOption('25');
  await form.locator('#fm-horario').selectOption('18:00');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['2']).toMatchObject({tipoTrat:'Pistola'});
  await expect.poll(()=>JSON.parse(database['lasala-tareas-v1']||'[]').filter(t=>t.categoria==='fumigacion')).toHaveLength(1);
  const tareas=JSON.parse(database['lasala-tareas-v1']||'[]').filter(t=>t.categoria==='fumigacion');
  expect(tareas[0]).toMatchObject({horario:'18:00',estado:'pendiente'});
  expect(tareas[0].asignadoA).toMatch(/PEON/i);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-500 y UAT-501: Pistola y Cañón no guardan una jornada sin producto ni dosis',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  for(const method of ['Pistola','Cañón']){
    await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
    const form=page.locator('#fito-manual-overlay');
    await form.locator('#fm-tipo-trat').selectOption(method);
    await form.getByRole('button',{name:'Guardar'}).click();
    await expect(page.getByText('Introduce el producto')).toBeVisible();
    await expect(form).toBeVisible();
    await form.getByRole('button',{name:'Cancelar'}).click();
  }
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-502: una jornada nueva sin método no se guarda aunque el resto esté completo',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-VALIDACION');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(page.getByText('Selecciona cómo se aplica: Pistola o Cañón')).toBeVisible();
  await expect(form).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-503: una jornada nueva sin volumen de caldo conserva la ficha y no escribe',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-VALIDACION');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(page.getByText('Selecciona el volumen de caldo')).toBeVisible();
  await expect(form).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-504 y UAT-507: caldo válido y dosis positiva guardan el tratamiento con su unidad',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-VALIDO');
  await form.locator('#fm-dosis').fill('1.5 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>{
    const raw=fitoData(database)?.['17']?.['30']?.['2'];
    return raw&&typeof raw==='object'?raw:null;
  }).toMatchObject({texto:'E2E-VALIDO 1.5 cc/l',caldoLitros:25,caldoLabel:'25L CUBA DE RUEDAS',tipoTrat:'Cañón'});
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-505 y UAT-506: dosis cero, negativa o no numérica bloquean la escritura',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-INVALIDO');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
  for(const dosis of ['0 cc/l','-1 cc/l','sin dosis']){
    await form.locator('#fm-dosis').fill(dosis);
    await form.getByRole('button',{name:'Guardar'}).click();
    await expect(page.getByText('La dosis debe ser un número mayor que cero')).toBeVisible();
    await expect(form).toBeVisible();
  }
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-037: dos sesiones conservan cambios de Plaguicidas en celdas distintas',async({page,context})=>{
  const database=fixtureDatabase(),hash=createHash('sha256').update(login.password).digest('hex');
  database['lasala-users-v1']=JSON.stringify({[login.user]:hash,E2E_FITO_ADMIN_2:hash});
  database['lasala-roles-v1']=JSON.stringify({[login.user]:'ADMIN',E2E_FITO_ADMIN_2:'ADMIN'});
  const first=await openFito(page,database,{writeDelayMs:120});
  await page.evaluate(()=>localStorage.setItem('lasala-sesion-v1',JSON.stringify({user:'E2E_FITO_ADMIN_2',ts:Date.now()})));
  const secondPage=await context.newPage();
  try{
    const second=await openFito(secondPage,database,{user:'E2E_FITO_ADMIN_2',loginFirst:false,writeDelayMs:120});
    for(const [target,street,value] of [[page,'3','E2E-FITO-USUARIO1'],[secondPage,'4','E2E-FITO-USUARIO2']]){
      const cell=target.locator(`#fito-grid-wrap input[data-finv="17"][data-fdia="32"][data-frc="${street}"]`);
      await cell.fill(value); await cell.press('Tab');
    }
    await Promise.all([first.overlay.getByRole('button',{name:'Guardar'}).click(),second.overlay.getByRole('button',{name:'Guardar'}).click()]);
    await expect.poll(()=>first.writes.length+second.writes.length).toBeGreaterThanOrEqual(3);
    expect(textoFito(database,'17','32','3')).toBe('E2E-FITO-USUARIO1');
    expect(textoFito(database,'17','32','4')).toBe('E2E-FITO-USUARIO2');
    expect(first.unexpectedHosts).toEqual([]); expect(second.unexpectedHosts).toEqual([]);
  }finally{ await secondPage.close(); }
});

test('UAT-038: borrar un tratamiento de prueba y guardar lo elimina también tras recargar',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database);
  const cell=page.locator('#fito-grid-wrap [data-finv="17"][data-fdia="32"][data-frc="2"]');
  await expect(cell).toHaveValue('E2E-FITO-DELETE');
  await cell.fill(''); await cell.press('Tab');
  await overlay.getByRole('button',{name:'Guardar'}).click();
  await expect.poll(()=>textoFito(database,'17','32','2')).toBeUndefined();
  await page.reload();
  const reloaded=await openFito(page,database,{loginFirst:false});
  await expect(page.locator('#fito-grid-wrap input[data-finv="17"][data-fdia="32"][data-frc="2"]')).toHaveValue('');
  expect(reloaded.unexpectedHosts).toEqual([]);
});


test('UAT-2430: si no carga la plantilla fitosanitaria no imprime ni modifica datos',async({page})=>{
  const database=fixtureDatabase();
  await page.addInitScript(()=>{
    window.__e2ePrintCalls=0;
    window.print=()=>{ window.parent.__e2ePrintCalls=(window.parent.__e2ePrintCalls||0)+1; };
  });
  const {unexpectedHosts,writes}=await openFito(page,database);
  const original=JSON.stringify(database);
  await page.route('**/assets/hoja-plaguicidas.jpg',route=>route.fulfill({status:404,body:'plantilla ausente'}));
  await page.evaluate(()=>imprimirHojaFitoConDatos({
    fechaISO:'2026-06-30',horario:'10:00',producto:'E2E-PLANTILLA',dosis:'1 cc/l',
    caldoLitros:25,caldoLabel:'25L CUBA DE RUEDAS',objetivos:[]
  }));
  await expect(page.locator('#app-toast')).toHaveText('No se pudo cargar la plantilla de impresión. No se abrió el documento.');
  await expect(page.locator('#print-fito-iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__e2ePrintCalls||0)).toBe(0);
  expect(JSON.stringify(database)).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2431: sin tratamiento Específico registrado válido no se genera documento ni alta',async({page})=>{
  const database=fixtureDatabase();
  await page.addInitScript(()=>{
    window.__e2ePrintCalls=0;
    window.print=()=>{ window.parent.__e2ePrintCalls=(window.parent.__e2ePrintCalls||0)+1; };
  });
  const {unexpectedHosts,writes}=await openFito(page,database);
  const original=JSON.stringify(database);
  const result=await page.evaluate(()=>imprimirHojaEspecificoConDatos({
    fechaISO:'2026-06-30',trat:'E2E-NO-REGISTRADO',dosis:'1',caldoLitros:25,
    filas:[{invId:'17',calles:'INV 17 CALLES 1-2'}]
  }));
  await expect(page.locator('#app-toast')).toHaveText('No hay un tratamiento Específico registrado válido. No se imprimió el documento.');
  expect(result).toBe(false);
  await expect(page.locator('#print-especifico-iframe')).toHaveCount(0);
  expect(await page.evaluate(()=>window.__e2ePrintCalls||0)).toBe(0);
  expect(JSON.stringify(database)).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-475, UAT-476 y UAT-478: Registrar, Consulta y Home navegan sin arrastrar vistas',async({page})=>{
  test.fail(true,'Plaguicidas abre directamente la cuadrícula y no presenta el menú Registrar/Consulta indicado por QC.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database,{selectINV:false});
  await expect(page.getByRole('button',{name:/Registrar tratamientos/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Consultar tratamientos/})).toBeVisible();
  await page.getByRole('button',{name:/Registrar tratamientos/}).click();
  await expect(overlay.locator('#fito-grid-wrap')).toBeVisible();
  await overlay.locator('#fito-btn-retroceder').click();
  await expect(page.getByRole('button',{name:/Registrar tratamientos/})).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-479: Plaguicidas en móvil ofrece dos accesos azules compactos sin desbordamiento',async({page})=>{
  test.fail(true,'El módulo actual no presenta los dos accesos Registrar/Consulta que pide el caso móvil.');
  const database=fixtureDatabase();
  await page.setViewportSize({width:390,height:844});
  const {overlay,unexpectedHosts}=await openFito(page,database,{selectINV:false});
  await expect(page.getByRole('button',{name:/Registrar tratamientos/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Consultar tratamientos/})).toBeVisible();
  const overflow=await overlay.evaluate(el=>el.scrollWidth>el.clientWidth);
  expect(overflow).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-480: la cabecera de Plaguicidas mantiene el azul y la tipografía de Control',async({page})=>{
  test.fail(true,'La cabecera del módulo usa rojo #a32020; QC requiere el azul de Control.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openFito(page,database,{selectINV:false});
  const header=overlay.locator(':scope > div > div').first();
  await expect(header).toHaveCSS('background-color','rgb(21, 88, 160)');
  await expect(overlay.getByText('Plaguicidas',{exact:false})).toHaveCount(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-487: tocar una celda vacía de hoy abre el alta con fecha e invernadero correctos',async({page})=>{
  test.fail(true,'Las celdas de la cuadrícula se editan directamente; el alta se abre desde la etiqueta del día.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const day=overlay.locator('#fito-grid-wrap td[onclick^="abrirFitoManualDia"][onclick*=",30)"]').first();
  const row=day.locator('xpath=..');
  await row.locator('td').nth(1).click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('#fm-dia')).toHaveValue('30');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-488: tocar una celda ocupada abre edición sin crear otra jornada',async({page})=>{
  test.fail(true,'Una pulsación no abre el editor de Plaguicidas; la edición manual se enlaza con doble clic.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const original=database['lasala-fito-v1'];
  await overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="30"][data-frc="2"]').click();
  await expect(page.locator('#fito-manual-overlay')).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-489: una fecha anterior a hoy no abre alta ni edición desde la cuadrícula',async({page})=>{
  test.fail(true,'La etiqueta de una fecha anterior abre el formulario manual aunque el día ya pasó.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const pastDay=overlay.locator('#fito-grid-wrap td[onclick^="abrirFitoManualDia"][onclick*=",29)"]').first();
  await pastDay.click();
  await expect(page.locator('#fito-manual-overlay')).toBeHidden();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-490: arrastrar desde una fecha pasada no inicia alta ni edición por tramo',async({page})=>{
  test.fail(true,'La cuadrícula permite iniciar el selector de tramo en fechas pasadas.');
  const database=fixtureDatabase();
  const values=JSON.parse(database['lasala-fito-v1']);
  values['17']['29']['4']='E2E-PAST-DRAG';
  database['lasala-fito-v1']=JSON.stringify(values);
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const start=overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="29"][data-frc="2"]');
  const end=overlay.locator('#fito-grid-wrap [data-finv="17"][data-fdia="29"][data-frc="4"]');
  await start.scrollIntoViewIfNeeded();
  const a=await start.boundingBox(),b=await end.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#fito-manual-overlay')).toBeHidden();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-491: el formulario de alta no permite seleccionar una fecha pasada',async({page})=>{
  test.fail(true,'El selector actual presenta las fechas de la quincena pasada sin deshabilitarlas.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await expect(form.locator('#fm-dia option[value="29"]')).toBeDisabled();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-492: elegir una fecha futura conserva la selección y no crea registros',async({page})=>{
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  const label=overlay.locator('#fito-quincena-bar span');
  const current=await label.textContent();
  await overlay.locator('#fito-quincena-bar button').last().click();
  await expect(label).not.toHaveText(current);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  const futureValue=await form.locator('#fm-dia option').last().getAttribute('value');
  await form.locator('#fm-dia').selectOption(futureValue);
  await expect(form.locator('#fm-dia')).toHaveValue(futureValue);
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-499: abrir y cerrar apartados del formulario conserva entradas y acciones',async({page})=>{
  test.fail(true,'Los apartados del formulario actual son encabezados fijos y no se despliegan ni pliegan.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-ACORDEON');
  const heading=form.getByText('Método y tratamiento',{exact:true});
  await heading.click();
  await expect(form.locator('#fm-tipo-trat')).toBeHidden();
  await expect(form.locator('#fm-trat')).toHaveValue('E2E-ACORDEON');
  await expect(form.getByRole('button',{name:'Cancelar'})).toBeVisible();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-511: cambiar Pistola/Cañón conserva el horario elegido',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-horario').selectOption('17:00');
  await form.locator('#fm-tipo-trat').selectOption('Pistola');
  await expect(form.locator('#fm-tipo-trat')).toHaveValue('Pistola');
  await expect(form.locator('#fm-horario')).toHaveValue('17:00');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-515: guardar y reabrir una jornada fixture conserva los datos sin marcarla ejecutada',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await completarFitoValido(form,'E2E-UAT515');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  await expect.poll(()=>fitoData(database)?.['17']?.['30']?.['2']).toMatchObject({
    texto:'E2E-UAT515 1 cc/l',caldoLitros:25,tipoTrat:'Cañón'
  });
  const cell=overlay.locator('#fito-grid-wrap input[data-finv="17"][data-fdia="30"]').first();
  await expect(cell).toBeVisible();
  await cell.dblclick();
  const editor=page.locator('#fito-manual-overlay');
  await expect(editor.locator('#fm-trat')).toHaveValue('E2E-UAT515');
  await expect(editor.locator('#fm-dosis')).toHaveValue('1 cc/l');
  await expect(editor.locator('#fm-caldo')).toHaveValue('25');
  const raw=fitoData(database)?.['17']?.['30']?.['2'];
  expect(Object.keys(raw||{}).some(key=>/ejecutado|realizado/i.test(key))).toBe(false);
  expect(unexpectedHosts).toEqual([]);
  expect(writes.filter(write=>write.path==='lasala-fito-v1')).toHaveLength(1);
});

test('UAT-508: guardar una mezcla de productos conserva cada texto y dosis introducidos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-PRODUCTO-A + E2E-PRODUCTO-B');
  await form.locator('#fm-dosis').fill('1 cc/l + 2 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeHidden();
  const raw=fitoData(database)?.['17']?.['30']?.['2'];
  const savedText=typeof raw==='string'?raw:raw?.texto;
  expect(savedText).toBe('E2E-PRODUCTO-A + E2E-PRODUCTO-B 1 cc/l + 2 cc/l');
  expect(savedText).toContain('E2E-PRODUCTO-A');
  expect(savedText).toContain('E2E-PRODUCTO-B');
  expect(savedText).toContain('1 cc/l');
  expect(savedText).toContain('2 cc/l');
  expect(unexpectedHosts).toEqual([]);
  expect(writes.filter(write=>write.path==='lasala-fito-v1')).toHaveLength(1);
});

test('UAT-509: el formulario informa del límite de cinco productos antes de imprimir',async({page})=>{
  test.fail(true,'El formulario acepta texto libre y no muestra control visible del máximo físico de cinco productos.');
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-A + E2E-B + E2E-C + E2E-D + E2E-E + E2E-F');
  await expect(form.getByText(/máximo.{0,20}cinco|cinco.{0,20}productos/i)).toBeVisible();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-510: una mezcla no se guarda si falta la dosis de uno de sus productos',async({page})=>{
  test.fail(true,'La validación trata la mezcla como texto libre y no comprueba una dosis individual por producto.');
  const database=fixtureDatabase();
  const original=database['lasala-fito-v1'];
  const {overlay,unexpectedHosts,writes}=await openFito(page,database);
  await overlay.getByRole('button',{name:/Añadir manualmente/}).click();
  const form=page.locator('#fito-manual-overlay');
  await form.locator('#fm-trat').fill('E2E-PRODUCTO-A + E2E-PRODUCTO-B');
  await form.locator('#fm-dosis').fill('1 cc/l');
  await form.locator('#fm-tipo-trat').selectOption('Cañón');
  await form.locator('#fm-caldo').selectOption('25');
  await form.getByRole('button',{name:'Guardar'}).click();
  await expect(form).toBeVisible();
  expect(database['lasala-fito-v1']).toBe(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

