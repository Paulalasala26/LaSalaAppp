const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const password = 'e2e-only-password';
const user = 'E2E_CONTROL_ADMIN';
const id = 'e2e-control-legacy-photo';
const legacyPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=';

function fixtureDatabase(){
  const hash=createHash('sha256').update(password).digest('hex');
  return {
    'lasala-users-v1':JSON.stringify({[user]:hash}),
    'lasala-roles-v1':JSON.stringify({[user]:'ADMIN'}),
    'lasala-control-items-v1':{
      [id]:{id,tipo:'tunel',dia:30,partida:'E2E-FOTO-HISTORICA',clienteVariedad:'Fixture histórico',invId:'17',calleDesde:1701,calleHasta:1701,numBandejas:10}
    },
    'lasala-control-fotos-indice-v1':JSON.stringify({[id]:'lasala-control-fotos-v1'}),
    'lasala-control-fotos-shards-index':JSON.stringify(['lasala-control-fotos-v1']),
    'lasala-control-fotos-v1':JSON.stringify({[id]:legacyPhoto})
  };
}

function readAt(object,path){return path.reduce((value,part)=>value==null?null:value[part],object)??null;}
function writeAt(object,path,value){
  let cursor=object;
  for(const part of path.slice(0,-1)){if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};cursor=cursor[part];}
  if(path.length){if(value===null)delete cursor[path.at(-1)];else cursor[path.at(-1)]=value;}
}
function etag(value){return value==null?'null_etag':`"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;}

async function openControl(page,database){
  const writes=[],unexpectedHosts=[];
  const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, PUT, OPTIONS','access-control-allow-headers':'Content-Type, If-Match, X-Firebase-ETag','access-control-expose-headers':'ETag'};
  await page.route(firebaseUrl,async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname!==firebaseHost){unexpectedHosts.push(url.hostname);await route.abort();return;}
    const path=url.pathname.replace(/^\//,'').replace(/\.json$/,'').split('/').filter(Boolean).map(decodeURIComponent);
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    const value=readAt(database,path);
    if(request.method()==='GET'){
      const headers=request.headers()['x-firebase-etag']==='true'?{etag:etag(value)}:{};
      await route.fulfill({status:200,contentType:'application/json',headers:{...cors,...headers},body:JSON.stringify(value)});return;
    }
    if(request.method()==='PUT'){
      const body=request.postData()?JSON.parse(request.postData()):null;
      const ifMatch=request.headers()['if-match'];
      if(ifMatch&&ifMatch!==etag(value)){await route.fulfill({status:412,headers:cors,body:'{"error":"etag mismatch"}'});return;}
      writes.push({path:path.join('/'),body});
      writeAt(database,path,body);
      await route.fulfill({status:200,contentType:'application/json',headers:{...cors,etag:etag(readAt(database,path))},body:JSON.stringify(body)});return;
    }
    await route.fulfill({status:405,headers:cors});
  });
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  await page.locator('#login-user').evaluate((select,value)=>{if(![...select.options].some(o=>o.value===value))select.add(new Option(value,value));},user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-control').click();
  const overlay=page.locator('#control-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button',{name:'Check Túnel'}).click();
  return {overlay,writes,unexpectedHosts};
}

test('UAT-407, UAT-408 y UAT-410: foto histórica solo lectura y preservada al añadir otra',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,writes,unexpectedHosts}=await openControl(page,database);
  const card=overlay.locator(`#control-card-${id}:visible`).first();
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(1);
  await expect(card.getByTestId(`control-photo-status-${id}-0`)).toContainText('Histórica');
  await expect(card.getByTestId(`control-photo-delete-${id}-0`)).toHaveCount(0);

  const removed=await page.evaluate(async id=>{window.confirm=()=>true;return eliminarFotoControl(id,0);},id);
  expect(removed).toBe(false);
  expect(database['lasala-control-fotos-v1']).toBe(JSON.stringify({[id]:legacyPhoto}));
  expect(writes.filter(write=>write.path.includes('control-fotos'))).toEqual([]);

  await card.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({
    name:'e2e-new-photo-next-to-legacy.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=','base64')
  });
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(2);
  await expect(card.getByTestId(`control-photo-status-${id}-0`)).toContainText('Histórica');
  const oldThumb=card.getByTestId(`control-photo-thumb-${id}-0`);
  const newThumb=card.getByTestId(`control-photo-thumb-${id}-1`);
  await expect(oldThumb.locator('xpath=..').locator('[data-testid^="control-photo-delete-"]')).toHaveCount(0);
  await expect(newThumb.locator('xpath=..').getByTestId(`control-photo-delete-${id}-1`)).toBeVisible();
  const preserved=await page.evaluate(id=>fotoSrcCompleta(controlFotosData[id][0]),id);
  expect(preserved).toBe(legacyPhoto);
  expect(writes.some(write=>write.path==='lasala-control-fotos-v1')).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});


async function stubDesktopCamera(page,mode='available'){
  await page.evaluate(mode=>{
    if(mode==='available'){
      const track={stopped:false,stop(){this.stopped=true;}};
      const stream=new MediaStream();
      Object.defineProperty(stream,'getTracks',{value:()=>[track]});
      window.__e2eCameraTrack=track;
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
      try{Object.defineProperty(CanvasRenderingContext2D.prototype,'drawImage',{configurable:true,value(){}});}catch(e){}
    }else{
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
        const name=mode==='denied'?'NotAllowedError':'NotFoundError';
        throw Object.assign(new Error(name),{name});
      }}});
    }
  },mode);
}

test('UAT-377 y UAT-378: en PC abre cámara, captura una imagen y cierra el flujo',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await openControl(page,database);
  await stubDesktopCamera(page);
  await overlay.getByTestId(`control-photo-camera-open-${id}`).click();
  const dialog=page.getByTestId('control-camera-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('control-camera-preview')).toBeVisible();
  await expect(dialog.getByTestId('control-camera-capture')).toBeEnabled();
  await dialog.getByTestId('control-camera-capture').click();
  await expect(dialog).toBeHidden();
  await expect(overlay.locator(`#control-card-${id} img[title="Ver foto"]`)).toHaveCount(2);
  expect(await page.evaluate(()=>window.__e2eCameraTrack.stopped)).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-379: cancelar cámara PC libera el stream y no crea foto',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,writes,unexpectedHosts}=await openControl(page,database);
  await stubDesktopCamera(page);
  await overlay.getByTestId(`control-photo-camera-open-${id}`).click();
  await page.getByTestId('control-camera-cancel').click();
  await expect(page.getByTestId('control-camera-dialog')).toBeHidden();
  await expect(overlay.locator(`#control-card-${id} img[title="Ver foto"]`)).toHaveCount(1);
  expect(await page.evaluate(()=>window.__e2eCameraTrack.stopped)).toBe(true);
  expect(writes.filter(write=>write.path.includes('control-fotos'))).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-380: permiso de cámara denegado informa y conserva la inspección',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,writes,unexpectedHosts}=await openControl(page,database);
  await stubDesktopCamera(page,'denied');
  await overlay.getByTestId(`control-photo-camera-open-${id}`).click();
  await expect(page.locator('#app-toast')).toContainText('Permite el acceso a la cámara');
  await expect(overlay.locator(`#control-card-${id} img[title="Ver foto"]`)).toHaveCount(1);
  await expect(overlay.locator(`#control-card-${id}`)).toContainText('Elegir fotos');
  expect(writes.filter(write=>write.path.includes('control-fotos'))).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-381: sin webcam informa y deja elegir fotos',async({page})=>{
  const database=fixtureDatabase();
  const {overlay,writes,unexpectedHosts}=await openControl(page,database);
  await stubDesktopCamera(page,'missing');
  await overlay.getByTestId(`control-photo-camera-open-${id}`).click();
  await expect(page.locator('#app-toast')).toContainText('No se detecta una cámara disponible');
  await expect(overlay.locator(`#control-card-${id}`)).toContainText('Elegir fotos');
  await expect(overlay.locator(`#control-card-${id} img[title="Ver foto"]`)).toHaveCount(1);
  expect(writes.filter(write=>write.path.includes('control-fotos'))).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});
