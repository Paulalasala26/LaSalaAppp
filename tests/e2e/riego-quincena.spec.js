const { createHash } = require('node:crypto');
const { test, expect } = require('@playwright/test');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_RIEGO_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase() {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [login.user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [login.user]: 'ADMIN' }),
    'lasala-riego-v1': JSON.stringify({
      '17': {
        '28': { '2': 'E2E-RIEGO-DIA-28' },
        '29': { '2': 'E2E-RIEGO-DIA-29' },
        '30': { '2': 'E2E-RIEGO-DIA-30' },
        '31': { '2': 'E2E-RIEGO-DIA-31' }
      },
      '18': { '30': { '2': 'E2E-RIEGO-INV-18' } }
    })
  };
}

function readAt(object, path) {
  return path.reduce((value, part) => value == null ? null : value[part], object) ?? null;
}

function writeAt(object, path, value) {
  let cursor = object;
  for (const part of path.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  if (path.length) {
    if (value === null) delete cursor[path.at(-1)];
    else cursor[path.at(-1)] = value;
  }
}

async function openRiego(page, database) {
  const unexpectedHosts = [];
  await page.route(firebaseUrl, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== firebaseHost) {
      unexpectedHosts.push(url.hostname);
      await route.abort();
      return;
    }
    const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const value = readAt(database, path);
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      return;
    }
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    if (request.method() === 'PUT') writeAt(database, path, body);
    else if (request.method() === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (request.method() === 'DELETE') writeAt(database, path, null);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  await page.locator('#login-user').evaluate((select, user) => select.add(new Option('Usuario E2E Riego', user)), login.user);
  await page.locator('#login-user').selectOption(login.user);
  await page.locator('#login-pass').fill(login.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('.home-shortcut-card[onclick="handleQuickAction(\'riego\')"]').click();
  const overlay = page.locator('#riego-overlay');
  await expect(overlay).toBeVisible();
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="17"]').click();
  return { overlay, database, unexpectedHosts };
}

test('UAT-067: entrar desde Inicio en Riego y volver conserva la sesión', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay } = await openRiego(page, database);

  await overlay.getByRole('button', { name: '✕', exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
});

test('UAT-068: Riego carga los registros del invernadero en la quincena actual', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);

  await expect(overlay.getByTestId('riego-quincena-label')).toContainText('29 jun — 12 jul');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-30');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-31');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-071: cambiar de invernadero no arrastra datos del anterior', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const grid = page.locator('#riego-grid-wrap');

  await expect(grid).toContainText('E2E-RIEGO-DIA-30');
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="18"]').click();
  await expect(grid).toContainText('E2E-RIEGO-INV-18');
  await expect(grid).not.toContainText('E2E-RIEGO-DIA-30');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-069, UAT-070 y UAT-072: la fecha local, la quincena y el dato histórico son correctos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const label = overlay.getByTestId('riego-quincena-label');

  await expect(label).toContainText('Quincena 2');
  await expect(page.locator('#riego-grid-wrap')).toContainText('30 jun');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-30');
  await expect(page.locator('#riego-grid-wrap')).not.toContainText('E2E-RIEGO-DIA-28');

  await overlay.getByTestId('riego-quincena-previous').click();
  await expect(label).toContainText('Quincena 1');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-28');
  await expect(page.locator('#riego-grid-wrap')).not.toContainText('E2E-RIEGO-DIA-30');

  await overlay.getByTestId('riego-quincena-next').click();
  await expect(label).toContainText('Quincena 2');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-30');
  await expect(page.locator('#riego-grid-wrap')).not.toContainText('E2E-RIEGO-DIA-28');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-074 y UAT-092: añadir riego abre el día correcto y cancelar no modifica datos', async ({ page }) => {
  const database = fixtureDatabase();
  const before = database['lasala-riego-v1'];
  const { overlay, unexpectedHosts } = await openRiego(page, database);

  await page.locator('#riego-grid-wrap').getByText('1 jul', { exact: true }).first().click();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('#rm-dia')).toHaveValue('31');
  await expect(form).toContainText('INV 17');

  await form.locator('button').first().click();
  await expect(form).toBeHidden();
  expect(database['lasala-riego-v1']).toBe(before);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-075: abrir una celda ocupada carga el contexto del riego existente', async ({ page }) => {
  const database = fixtureDatabase();
  const { unexpectedHosts } = await openRiego(page, database);
  const cell = page.locator(`#riego-grid-wrap textarea[ondblclick*="editarRiegoManualDesdeCelda('17',30"]`);
  await expect(cell).toHaveValue('E2E-RIEGO-DIA-30');
  await cell.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('#rm-dia')).toHaveValue('30');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-30');
  expect(unexpectedHosts).toEqual([]);
});
