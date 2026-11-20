const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const appOrigin = 'http://127.0.0.1:4173';
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');
const appRoot = path.resolve(__dirname, '..', '..');

const users = { E2E_ADMIN: passwordHash, E2E_PEON: passwordHash };
const roles = { E2E_ADMIN: 'ADMIN', E2E_PEON: 'PEON' };

async function installIsolatedFixture(context) {
  const database = {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-mantenimiento-v1': JSON.stringify([])
  };
  const writes = [];
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'ETag'
  };

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin) {
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(appRoot, '.' + pathname);
      if (file !== appRoot && !file.startsWith(appRoot + path.sep)) {
        await route.fulfill({ status: 403, body: 'Forbidden' });
        return;
      }
      try {
        const body = await fs.readFile(file);
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body });
      } catch {
        await route.fulfill({ status: 404, body: 'Not found' });
      }
      return;
    }

    if (url.hostname !== firebaseHost) {
      await route.abort();
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
    } else if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(database[key] ?? null) });
    } else if (method === 'PUT') {
      writes.push({ key, body: request.postData() });
      database[key] = JSON.parse(request.postData() || 'null');
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(database[key]) });
    } else {
      await route.fulfill({ status: 405, headers: corsHeaders, body: 'Method not allowed' });
    }
  });
  return { database, writes };
}

async function logInAs(page, user) {
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
}

test('UAT-2127: dos contextos privados mantienen separadas la sesión y los módulos visibles', async ({ page, browser }) => {
  const admin = await installIsolatedFixture(page.context());
  await page.goto('/');
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.getByRole('heading', { name: 'Bienvenido, E2e_admin' })).toBeVisible();
  await expect(page.locator('#quick-access-block .home-shortcut-card[data-testid="home-control"]')).toBeVisible();
  await expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lasala-sesion-v1')).user)).toBe('E2E_ADMIN');

  const privateContext = await browser.newContext();
  try {
    const peon = await installIsolatedFixture(privateContext);
    const privatePage = await privateContext.newPage();
    await privatePage.goto(appOrigin + '/');
    await logInAs(privatePage, 'E2E_PEON');
    await expect(privatePage.locator('#page-home')).toBeVisible();
    await expect(privatePage.locator('#topbar-username')).toHaveText('E2e_peon');
    await expect(privatePage.locator('#quick-access-block')).toBeHidden();
    await expect(privatePage.locator('#peon-tareas-inline')).toBeVisible();
    await expect(await privatePage.evaluate(() => JSON.parse(localStorage.getItem('lasala-sesion-v1')).user)).toBe('E2E_PEON');

    await expect(page.getByRole('heading', { name: 'Bienvenido, E2e_admin' })).toBeVisible();
    await page.reload();
    await privatePage.reload();
    await expect(page.getByRole('heading', { name: 'Bienvenido, E2e_admin' })).toBeVisible();
    await expect(privatePage.locator('#page-home')).toBeVisible();
    await expect(privatePage.locator('#topbar-username')).toHaveText('E2e_peon');
    expect(admin.writes).toEqual([]);
    expect(peon.writes).toEqual([]);
  } finally {
    await privateContext.close();
  }
});


test('UAT-2131: cambiar de perfil no reutiliza Control de Calidad ni permisos de ADMIN', async ({ page }) => {
  const fixture = await installIsolatedFixture(page.context());
  await page.goto('/');
  await logInAs(page, 'E2E_ADMIN');
  const controlShortcut = page.locator('#quick-access-block .home-shortcut-card[data-testid="home-control"]');
  await expect(controlShortcut).toBeVisible();
  await controlShortcut.click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await control.getByRole('button', { name: /✕/ }).last().click();
  await expect(control).toBeHidden();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await logInAs(page, 'E2E_PEON');
  await expect(page.locator('#topbar-username')).toHaveText('E2e_peon');
  await expect(page.locator('#quick-access-block')).toBeHidden();
  await expect(page.locator('#peon-tareas-inline')).toBeVisible();

  const writesBeforePeonAccess = fixture.writes.length;
  const opened = await page.evaluate(async () => await showControlModule());
  expect(opened).toBe(false);
  await expect(control).toBeHidden();
  expect(fixture.writes.slice(writesBeforePeonAccess)).toEqual([]);
});
