const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');
const roles = { E2E_ADMIN: 'ADMIN', PEON1: 'PEON' };

async function installTwoTabFixture(page, task) {
  const database = {
    'lasala-users-v1': JSON.stringify(Object.fromEntries(Object.keys(roles).map(user => [user, passwordHash]))),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify([task]),
    'lasala-mantenimiento-v1': JSON.stringify([]),
    'lasala-historial-v1': JSON.stringify([])
  };
  const writes = [];
  const versions = new Map();
  await page.context().route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) return route.abort();
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    const headers = route.request().headers();
    const etag = '"e2e-' + (versions.get(key) || 0) + '"';
    const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'ETag' };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (method === 'GET') {
      const value = Object.hasOwn(database, key) ? database[key] : null;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: etag }, body: JSON.stringify(value) });
    }
    if (method === 'PUT') {
      if (headers['if-match'] && headers['if-match'] !== etag) return route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: 'null' });
      const value = JSON.parse(route.request().postData() || 'null');
      writes.push({ key, value });
      database[key] = value;
      versions.set(key, (versions.get(key) || 0) + 1);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: '"e2e-' + versions.get(key) + '"' }, body: JSON.stringify(value) });
    }
    return route.fulfill({ status: 405, headers: corsHeaders, body: 'Method not allowed' });
  });
  await page.goto('/');
  return { database, writes };
}

async function logInAs(page, user) {
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
}

test('UAT-2116: pestaña obsoleta no puede anular tras cerrar sesión en otra pestaña', async ({ page }) => {
  const task = { id: 'e2e-uat2116-stale-tab', titulo: 'UAT-2116 tarea pendiente', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', fechaISO: '2026-11-20', estado: 'pendiente' };
  const { database, writes } = await installTwoTabFixture(page, task);
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.locator('#page-home')).toBeVisible();

  const stalePage = await page.context().newPage();
  await stalePage.goto('/');
  await expect(stalePage.locator('#page-home')).toBeVisible();
  await stalePage.getByRole('button', { name: 'Salir' }).click();
  await expect(stalePage.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#page-home')).toBeVisible();

  await page.bringToFront();
  await page.locator("#quick-access-block .home-shortcut-card[onclick=\"handleQuickAction('tareas')\"]").click();
  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  const row = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Anular' }).click();
  await page.waitForTimeout(250);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toEqual([]);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
});
