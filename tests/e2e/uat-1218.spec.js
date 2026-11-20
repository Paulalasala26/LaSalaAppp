const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseOrigin = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');
const appOrigin = 'http://127.0.0.1:4173';

function readAt(object, parts) {
  return parts.reduce((value, part) => value == null ? null : value[part], object) ?? null;
}
function writeAt(object, parts, value) {
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  if (parts.length) {
    if (value === null) delete cursor[parts.at(-1)];
    else cursor[parts.at(-1)] = value;
  }
}
function etag(value) {
  return value == null ? 'null_etag' : '"' + createHash('sha1').update(JSON.stringify(value)).digest('hex') + '"';
}

test('UAT-1218: toque móvil abre la celda exacta sin activar teclado de grid', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'Europe/Madrid' });
  const page = await context.newPage();
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_ESPECIFICOS_ADMIN: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ESPECIFICOS_ADMIN: 'ADMIN' }),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-especificos-partida-v1': JSON.stringify({}),
    'lasala-especificos-v1': JSON.stringify({
      '17': { '30': { '18': 'E2E-ESPECIFICO-INV17' } },
      '18': { '30': { '18': 'E2E-ESPECIFICO-INV18' } }
    })
  };
  const writes = [];
  const unexpectedHosts = [];
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-Match, X-Firebase-ETag',
    'Access-Control-Expose-Headers': 'ETag'
  };
  try {
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === appOrigin) {
        if (url.pathname === '/' || url.pathname === '/index.html') {
          const html = await fs.readFile(path.resolve(__dirname, '..', '..', 'index.html'));
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'Cache-Control': 'no-store' }, body: html });
        }
        return route.fulfill({ status: 404, body: 'Not found' });
      }
      if (url.hostname !== firebaseHost || !firebaseOrigin.test(request.url())) {
        unexpectedHosts.push(url.hostname);
        return route.abort();
      }
      const parts = url.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
      const method = request.method();
      const current = readAt(database, parts);
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
      if (method === 'GET') {
        const headers = request.headers()['x-firebase-etag'] === 'true' ? { ETag: etag(current) } : {};
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ...headers }, body: JSON.stringify(current) });
      }
      if (['PUT', 'PATCH', 'DELETE'].includes(method)) {
        const ifMatch = request.headers()['if-match'];
        if (ifMatch && ifMatch !== etag(current)) return route.fulfill({ status: 412, headers: corsHeaders, body: '{"error":"etag mismatch"}' });
        const value = method === 'DELETE' ? null : JSON.parse(request.postData() || 'null');
        writes.push({ method, path: parts.join('/'), value });
        if (method === 'PUT') writeAt(database, parts, value);
        else if (method === 'PATCH') writeAt(database, parts, { ...(current || {}), ...value });
        else writeAt(database, parts, null);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: etag(readAt(database, parts)) }, body: JSON.stringify(readAt(database, parts)) });
      }
      return route.fulfill({ status: 405, headers: corsHeaders, body: 'Method not allowed' });
    });

    await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
    await page.goto('/');
    await page.locator('#login-user').evaluate((select, user) => select.add(new Option(user, user)), 'E2E_ESPECIFICOS_ADMIN');
    await page.locator('#login-user').selectOption('E2E_ESPECIFICOS_ADMIN');
    await page.locator('#login-pass').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('#app')).toBeVisible();
    await page.evaluate(() => showEspecificosModule());

    const overlay = page.locator('#especificos-overlay');
    await expect(overlay).toBeVisible();
    await overlay.locator('[data-einv="17"]').click();
    const cell = overlay.locator('#especificos-grid-wrap input[data-einv="17"][data-edia="29"][data-erc="18"]');
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();
    await cell.tap();

    const editor = page.locator('#especifico-manual-overlay');
    await expect(editor).toBeVisible();
    await expect(editor.locator('#esp-dia')).toHaveValue('29');
    await expect(editor).toContainText('INV 17 · Calles 18');
    expect(await cell.evaluate(element => element.readOnly)).toBe(true);
    expect(writes).toEqual([]);
    expect(unexpectedHosts).toEqual([]);
  } finally {
    await context.close();
  }
});
