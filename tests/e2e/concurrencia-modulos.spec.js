const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const password = 'e2e-only-password';
const users = ['E2E_CONCURRENCIA_CONTROL', 'E2E_CONCURRENCIA_RIEGO'];

function fixtureDatabase() {
  const passwordHash = createHash('sha256').update(password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify(Object.fromEntries(users.map(user => [user, passwordHash]))),
    'lasala-roles-v1': JSON.stringify(Object.fromEntries(users.map(user => [user, 'ADMIN']))),
    'lasala-control-items-v1': {
      'e2e-concurrente-control': {
        id: 'e2e-concurrente-control', tipo: 'tunel', dia: 30,
        partida: 'E2E-CONCURRENCIA-CONTROL', clienteVariedad: 'Fixture control concurrente',
        invId: '17', calleDesde: 1701, calleHasta: 1701, numBandejas: 10
      }
    },
    'lasala-riego-v1': JSON.stringify({
      '17': { '32': { '2': '10 + PP + 1º HORA' } }
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

function etag(value) {
  return value == null ? 'null_etag' : `"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;
}

async function installFirebaseFixture(page, database, writes) {
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, If-Match, X-Firebase-ETag',
    'access-control-expose-headers': 'ETag'
  };
  await page.route(firebaseUrl, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== firebaseHost) return route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const current = readAt(database, path);
    if (request.method() === 'GET') {
      const headers = request.headers()['x-firebase-etag'] === 'true' ? { etag: etag(current) } : {};
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ...headers }, body: JSON.stringify(current) });
    }
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    writes.push({ page: page === page.context().pages()[0] ? 'control' : 'riego', method: request.method(), path: path.join('/'), body });
    await new Promise(resolve => setTimeout(resolve, 100));
    const ifMatch = request.headers()['if-match'];
    if (ifMatch && ifMatch !== etag(readAt(database, path))) {
      return route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'etag mismatch' }) });
    }
    if (request.method() === 'PUT') writeAt(database, path, body);
    else if (request.method() === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (request.method() === 'DELETE') writeAt(database, path, null);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, etag: etag(readAt(database, path)) }, body: JSON.stringify(body) });
  });
}

async function loginAs(page, user) {
  await page.locator('#login-user').evaluate((select, username) => select.add(new Option(username, username)), user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#app')).toBeVisible();
}

test('UAT-061, UAT-063–064: dos sesiones trabajan en módulos distintos, guardan casi a la vez y las operaciones repetidas sobreviven a recargas', async ({ page, context }) => {
  const database = fixtureDatabase();
  const writes = [];
  const otherPage = await context.newPage();
  try {
    await installFirebaseFixture(page, database, writes);
    await page.clock.install({ time: new Date('2026-06-30T10:00:00+02:00') });
    await page.goto('/');
    await loginAs(page, users[0]);
    await page.getByTestId('home-control').click();
    const control = page.locator('#control-overlay');
    await expect(control).toBeVisible();
    await control.getByRole('button', { name: 'Check Túnel' }).click();
    const controlCheck = control.getByTestId('control-option-e2e-concurrente-control-color-verde');
    await expect(controlCheck).toBeVisible();

    await page.evaluate(user => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user, ts: Date.now() })), users[1]);
    await installFirebaseFixture(otherPage, database, writes);
    await otherPage.clock.install({ time: new Date('2026-06-30T10:00:00+02:00') });
    await otherPage.goto('/');
    await expect(otherPage.locator('#app')).toBeVisible();
    await otherPage.locator(".home-shortcut-card[onclick=\"handleQuickAction('riego')\"]").click();
    const riego = otherPage.locator('#riego-overlay');
    await expect(riego).toBeVisible();
    await otherPage.locator('#riego-inv-selector-toggle').click();
    await otherPage.locator('[data-rinv="17"]').click();
    const riegoCell = otherPage.locator('#riego-grid-wrap textarea[ondblclick*="' + "'17',32" + '"]');
    await expect(riegoCell).toHaveValue('10 + PP + 1º HORA');
    await riegoCell.dblclick();
    const riegoForm = otherPage.locator('#riego-manual-overlay');
    await expect(riegoForm).toBeVisible();
    await riegoForm.locator('.rm-agua-min').first().selectOption('20');

    await page.clock.fastForward(3 * 60 * 1000);
    await otherPage.clock.fastForward(3 * 60 * 1000);
    await expect(page.locator('#app')).toBeVisible();
    await expect(otherPage.locator('#app')).toBeVisible();
    await expect(control).toBeVisible();
    await expect(riegoForm).toBeVisible();

    await Promise.all([
      controlCheck.click(),
      riegoForm.locator('#rm-guardar-btn').click()
    ]);
    await expect.poll(() => database['lasala-control-items-v1']['e2e-concurrente-control'].color?.verde).toBe(true);
    await expect.poll(() => JSON.parse(database['lasala-riego-v1'])['17']['32']['2']?.texto).toContain('20');
    expect(writes.some(write => write.path.includes('e2e-concurrente-control'))).toBe(true);
    expect(writes.some(write => write.path === 'lasala-riego-v1')).toBe(true);
    await expect(controlCheck).toContainText('✓');
    await expect(riegoForm).toBeHidden();

    const grande = control.getByTestId('control-option-e2e-concurrente-control-tamano-grande');
    const currentRiegoCell = otherPage.locator('#riego-grid-wrap textarea[ondblclick*="' + "'17',32" + '"]');
    await currentRiegoCell.dblclick();
    const repeatedRiegoForm = otherPage.locator('#riego-manual-overlay');
    await expect(repeatedRiegoForm).toBeVisible();
    await repeatedRiegoForm.locator('.rm-agua-min').first().selectOption('30');
    await Promise.all([
      grande.click(),
      repeatedRiegoForm.locator('#rm-guardar-btn').click()
    ]);
    await expect.poll(() => database['lasala-control-items-v1']['e2e-concurrente-control'].tamano?.grande).toBe(true);
    await expect.poll(() => JSON.parse(database['lasala-riego-v1'])['17']['32']['2']?.texto).toContain('30');

    await page.evaluate(user => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user, ts: Date.now() })), users[0]);
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await page.getByTestId('home-control').click();
    const reloadedControl = page.locator('#control-overlay');
    await expect(reloadedControl).toBeVisible();
    await reloadedControl.getByRole('button', { name: 'Check Túnel' }).click();
    await expect(reloadedControl.getByTestId('control-option-e2e-concurrente-control-color-verde')).toContainText('✓');
    await expect(reloadedControl.getByTestId('control-option-e2e-concurrente-control-tamano-grande')).toContainText('✓');

    await otherPage.evaluate(user => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user, ts: Date.now() })), users[1]);
    await otherPage.reload();
    await expect(otherPage.locator('#app')).toBeVisible();
    await otherPage.locator(".home-shortcut-card[onclick=\"handleQuickAction('riego')\"]").click();
    await otherPage.locator('#riego-inv-selector-toggle').click();
    await otherPage.locator('[data-rinv="17"]').click();
    await expect(otherPage.locator('#riego-grid-wrap textarea[ondblclick*="' + "'17',32" + '"]')).toHaveValue(/30/);
  } finally {
    await otherPage.close();
  }
});

test('UAT-065: una sesión de 20 minutos recorre Control, Riego, Plaguicidas y Partidas sin errores ni pérdidas', async ({ page }) => {
  const passwordHash = createHash('sha256').update(password).digest('hex');
  const user = 'E2E_SOAK_ADMIN';
  const database = {
    'lasala-users-v1': JSON.stringify({ [user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [user]: 'ADMIN' }),
    'lasala-control-items-v1': {
      'e2e-soak-control': {
        id: 'e2e-soak-control', tipo: 'tunel', dia: 30, partida: 'E2E-SOAK-CONTROL',
        clienteVariedad: 'Fixture sesión prolongada', invId: '17', calleDesde: 1701, calleHasta: 1701,
        numBandejas: 10
      }
    },
    'lasala-riego-v1': JSON.stringify({ '17': { '32': { '2': 'E2E-SOAK-RIEGO' } } }),
    'lasala-fito-v1': JSON.stringify({ '17': { '30': { '2': 'E2E-SOAK-PLAGUICIDAS' } } }),
    'lasala-tareas-v1': '[]'
  };
  const writes = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installFirebaseFixture(page, database, writes);
  await page.clock.install({ time: new Date('2026-06-30T10:00:00+02:00') });
  const startTime = new Date('2026-06-30T10:00:00+02:00').getTime();
  await page.goto('/');
  await loginAs(page, user);

  await page.getByTestId('home-control').click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await control.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(control.getByText('E2E-SOAK-CONTROL', { exact: true })).toBeVisible();
  await control.getByTestId('control-option-e2e-soak-control-color-verde').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-soak-control'].color?.verde).toBe(true);
  await page.clock.fastForward(5 * 60 * 1000);
  await control.getByRole('button', { name: '✕ Cerrar' }).click();

  await page.locator(".home-shortcut-card[onclick=\"handleQuickAction('riego')\"]").click();
  const riego = page.locator('#riego-overlay');
  await expect(riego).toBeVisible();
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="17"]').click();
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-SOAK-RIEGO');
  await page.clock.fastForward(5 * 60 * 1000);
  await riego.getByRole('button', { name: '✕', exact: true }).click();

  await page.locator(".home-shortcut-card[onclick=\"handleQuickAction('plaguicidas')\"]").click();
  const fito = page.locator('#fito-overlay');
  await expect(fito).toBeVisible();
  await fito.locator('[data-finv="17"]').click();
  await expect(page.locator('#fito-grid-wrap')).toContainText('E2E-SOAK-PLAGUICIDAS');
  await page.clock.fastForward(5 * 60 * 1000);
  await fito.getByRole('button', { name: '✕', exact: true }).click();

  await page.getByTestId('home-partidas').click();
  const partidas = page.locator('#partidas-overlay');
  await expect(partidas).toBeVisible();
  await partidas.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await partidas.getByRole('button', { name: '17', exact: true }).click();
  await expect(partidas).toContainText('INV.17');
  await page.clock.fastForward(5 * 60 * 1000);
  await partidas.getByRole('button', { name: /Cerrar/ }).click();

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#app')).toBeVisible();
  expect(await page.evaluate(() => Date.now())).toBeGreaterThanOrEqual(startTime + 20 * 60 * 1000);
  expect(database['lasala-control-items-v1']['e2e-soak-control'].color?.verde).toBe(true);
  expect(JSON.parse(database['lasala-riego-v1'])['17']['32']['2']).toBe('E2E-SOAK-RIEGO');
  expect(JSON.parse(database['lasala-fito-v1'])['17']['30']['2']).toBe('E2E-SOAK-PLAGUICIDAS');
  await expect(page.locator('#aviso-fallo-guardado')).toBeHidden();
  expect(pageErrors).toEqual([]);
  expect(writes.some(write => write.path.includes('e2e-soak-control'))).toBe(true);
});
