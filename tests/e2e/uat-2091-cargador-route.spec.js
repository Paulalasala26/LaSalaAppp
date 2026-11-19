const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');

test('UAT-2091: CARGADOR no accede a Partidas al invocar directamente la ruta de gestor', async ({ page }) => {
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_CARGADOR: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_CARGADOR: 'CARGADOR' }),
    'lasala-control-items-v1': JSON.stringify({})
  };
  const protectedReads = [];
  const writes = [];

  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) return route.abort();
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    if (key === 'lasala-control-items-v1' && method === 'GET') protectedReads.push(key);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(database[key] ?? null) });
    if (method === 'PUT') {
      writes.push(key);
      database[key] = JSON.parse(route.request().postData() || 'null');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(database[key]) });
    }
    return route.fulfill({ status: 405, body: 'Method not allowed' });
  });

  await page.goto('/');
  await page.locator('#login-user').evaluate(select => select.add(new Option('E2E_CARGADOR', 'E2E_CARGADOR')));
  await page.locator('#login-user').selectOption('E2E_CARGADOR');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  await page.evaluate(() => handleQuickAction('partidas'));

  await expect(page.locator('#partidas-overlay')).toBeHidden();
  expect(protectedReads).toEqual([]);
  expect(writes).toEqual([]);
});
