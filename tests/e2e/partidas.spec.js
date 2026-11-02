const { createHash } = require('node:crypto');
const { test, expect } = require('@playwright/test');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_PARTIDAS_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase() {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [login.user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [login.user]: 'ADMIN' }),
    'lasala-control-items-v1': {
      'e2e-partida-001': {
        id: 'e2e-partida-001',
        tipo: 'tunel',
        dia: 57,
        partida: 'E2E-PARTIDA-001',
        clienteVariedad: 'Fixture variedad conocida',
        invId: '17',
        calleDesde: 18,
        calleHasta: 18,
        numBandejas: 12,
        observaciones: 'Observación de fixture E2E'
      }
    }
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

async function openPartidas(page) {
  const database = fixtureDatabase();
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

  await page.clock.setFixedTime(new Date('2026-07-27T10:00:00+02:00'));
  await page.goto('/');
  await page.locator('#login-user').evaluate((select, user) => select.add(new Option('Usuario E2E Partidas', user)), login.user);
  await page.locator('#login-user').selectOption(login.user);
  await page.locator('#login-pass').fill(login.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-partidas').click();
  const overlay = page.locator('#partidas-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '17', exact: true }).click();
  return { overlay, unexpectedHosts };
}

test('UAT-028: Partidas muestra el registro conocido del invernadero seleccionado', async ({ page }) => {
  const { overlay, unexpectedHosts } = await openPartidas(page);
  const map = page.locator('#partidas-content-wrap');

  await expect(map).toContainText('E2E-PARTIDA-001');
  await expect(map).toContainText('Fixture variedad conocida');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-029: abrir el detalle de una partida y volver al mapa conserva el estado', async ({ page }) => {
  const { overlay, unexpectedHosts } = await openPartidas(page);
  const partida = page.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-001', { exact: true });

  await partida.click();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-PARTIDA-001');
  await expect(history).toContainText('Observación de fixture E2E');
  await history.getByRole('button', { name: 'Cerrar' }).click();
  await expect(history).toBeHidden();
  await expect(overlay).toBeVisible();
  await expect(page.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
  expect(unexpectedHosts).toEqual([]);
});
