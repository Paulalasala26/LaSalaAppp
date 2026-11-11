const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const expectedFirebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_CONTROL_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase(user = login.user) {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [user]: 'ADMIN' }),
    'lasala-control-items-v1': {
      'e2e-control-previous-fortnight': {
        id: 'e2e-control-previous-fortnight',
        tipo: 'tunel',
        dia: 15,
        partida: 'E2E-QUINCENA-ANTERIOR',
        clienteVariedad: 'Fixture quincena anterior',
        invId: '17',
        calleDesde: 1701,
        calleHasta: 1701,
        numBandejas: 10
      },
      'e2e-control-current-fortnight': {
        id: 'e2e-control-current-fortnight',
        tipo: 'tunel',
        dia: 30,
        partida: 'E2E-QUINCENA-ACTUAL-DIA-30',
        clienteVariedad: 'Fixture quincena actual',
        invId: '17',
        calleDesde: 1702,
        calleHasta: 1702,
        numBandejas: 12
      },
      'e2e-control-current-fortnight-second-line': {
        id: 'e2e-control-current-fortnight-second-line',
        tipo: 'tunel',
        dia: 30,
        partida: 'E2E-QUINCENA-ACTUAL-OTRA-LINEA',
        clienteVariedad: 'Fixture independiente del mismo día',
        invId: '17',
        calleDesde: 1704,
        calleHasta: 1704,
        numBandejas: 8
      },
      'e2e-control-next-day': {
        id: 'e2e-control-next-day',
        tipo: 'tunel',
        dia: 31,
        partida: 'E2E-QUINCENA-SIGUIENTE-DIA-01',
        clienteVariedad: 'Fixture día siguiente',
        invId: '17',
        calleDesde: 1703,
        calleHasta: 1703,
        numBandejas: 9
      },
      'e2e-control-current-fortnight-other-greenhouse': {
        id: 'e2e-control-current-fortnight-other-greenhouse',
        tipo: 'tunel',
        dia: 30,
        partida: 'E2E-QUINCENA-INV-18',
        clienteVariedad: 'Fixture de otro invernadero',
        invId: '18',
        calleDesde: 1801,
        calleHasta: 1801,
        numBandejas: 6
      },
      'e2e-control-current-fortnight-completed': {
        id: 'e2e-control-current-fortnight-completed',
        tipo: 'tunel',
        dia: 30,
        partida: 'E2E-QUINCENA-COMPLETADA',
        clienteVariedad: 'Fixture inspección completada',
        invId: '17',
        calleDesde: 1705,
        calleHasta: 1705,
        numBandejas: 9,
        color: { verde: true },
        tamano: { ok: true },
        plagas: { ok: true },
        enfermedades: { ok: true },
        flores: { si: true },
        raices: { ok: true }
      },
      'e2e-control-current-fortnight-multi-segment': {
        id: 'e2e-control-current-fortnight-multi-segment',
        tipo: 'tunel',
        dia: 30,
        partida: 'E2E-QUINCENA-VARIOS-TRAMOS',
        clienteVariedad: 'Fixture de varios tramos',
        invId: '17',
        calleDesde: 1,
        calleHasta: 9,
        tramos: [{ desde: 1, hasta: 3 }, { desde: 8, hasta: 9 }],
        numBandejas: 7
      },
      'e2e-control-current-fortnight-first-day': {
        id: 'e2e-control-current-fortnight-first-day',
        tipo: 'tunel',
        dia: 29,
        partida: 'E2E-QUINCENA-ACTUAL-DIA-29',
        clienteVariedad: 'Fixture quincena actual, primer día',
        invId: '17',
        calleDesde: 1703,
        calleHasta: 1703,
        numBandejas: 12
      },
      'e2e-control-carga-current-fortnight': {
        id: 'e2e-control-carga-current-fortnight',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga',
        partida: 'E2E-CARGA-QUINCENA-ACTUAL',
        variedad: 'CALABACÍN',
        numBandejas: 14,
        invernadero: '17-8-8'
      },
      'e2e-control-carga-manual-format': {
        id: 'e2e-control-carga-manual-format',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga con formato de partida',
        partida: '26X00044',
        variedad: 'CALABACÍN',
        numBandejas: 7,
        invernadero: '17-4-4'
      },
      'e2e-control-carga-current-fortnight-completed': {
        id: 'e2e-control-carga-current-fortnight-completed',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga completada',
        partida: 'E2E-CARGA-COMPLETADA',
        variedad: 'CALABACÍN',
        numBandejas: 10,
        invernadero: '17-9-9',
        color: { ok: true },
        tamano: { ok: true },
        firmeza: { ok: true },
        plagas: { ok: true },
        enfermedades: { ok: true },
        flores: { no: true },
        raices: { ok: true }
      },
      'e2e-control-carga-catalog-other-variety': {
        id: 'e2e-control-carga-catalog-other-variety',
        tipo: 'carga',
        dia: 30,
        cliente: 'CLIENTE CATÁLOGO B',
        partida: '26X00045',
        variedad: 'PEPINO',
        numBandejas: 8,
        invernadero: '16-1-1'
      },
      'e2e-control-carga-other-greenhouse': {
        id: 'e2e-control-carga-other-greenhouse',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga otro INV',
        partida: 'E2E-CARGA-INV-18',
        variedad: 'CALABACÍN',
        numBandejas: 6,
        invernadero: '18-1-2'
      },
      'e2e-control-carga-unassigned': {
        id: 'e2e-control-carga-unassigned',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga sin ubicación',
        partida: 'E2E-CARGA-SIN-UBICACION',
        variedad: 'CALABACÍN',
        numBandejas: 5
      },
      'e2e-control-carga-legacy-location': {
        id: 'e2e-control-carga-legacy-location',
        tipo: 'carga',
        dia: 30,
        cliente: 'Fixture carga ubicación heredada',
        partida: 'E2E-CARGA-UBICACION-20',
        variedad: 'CALABACÍN',
        numBandejas: 4,
        invernadero: '20-18-20'
      },
      'e2e-control-carga-previous-day': {
        id: 'e2e-control-carga-previous-day',
        tipo: 'carga',
        dia: 29,
        cliente: 'Fixture carga día anterior',
        partida: 'E2E-CARGA-DIA-ANTERIOR',
        variedad: 'CALABACÍN',
        numBandejas: 11,
        invernadero: '17-3-3'
      },
      'e2e-control-carga-next-fortnight': {
        id: 'e2e-control-carga-next-fortnight',
        tipo: 'carga',
        dia: 31,
        cliente: 'Fixture carga otra quincena',
        partida: 'E2E-CARGA-OTRA-QUINCENA',
        variedad: 'CALABACÍN',
        numBandejas: 13,
        invernadero: '17-8-8'
      }
    }
  };
}

function withControlRoles(database, extraRoles) {
  const users = JSON.parse(database['lasala-users-v1']);
  const roles = JSON.parse(database['lasala-roles-v1']);
  const hash = createHash('sha256').update(login.password).digest('hex');
  for (const [user, role] of Object.entries(extraRoles)) {
    users[user] = hash;
    roles[user] = role;
  }
  database['lasala-users-v1'] = JSON.stringify(users);
  database['lasala-roles-v1'] = JSON.stringify(roles);
  return database;
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

function firebaseEtag(value) {
  if (value == null) return 'null_etag';
  return `"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;
}

async function interceptFirebase(page, database, writeDelayMs = 0) {
  const unexpectedHosts = [];
  let networkAvailable = true;
  let failWrites = false;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, If-Match, X-Firebase-ETag',
    'access-control-expose-headers': 'ETag'
  };
  // Toda petición a la base de producción queda interceptada y atendida en memoria.
  await page.route(firebaseUrl, async route => {
    const request = route.request();
    if (new URL(request.url()).hostname !== expectedFirebaseHost) {
      unexpectedHosts.push(new URL(request.url()).hostname);
      await route.abort();
      return;
    }
    if (!networkAvailable && request.method() !== 'OPTIONS') {
      await route.abort('internetdisconnected');
      return;
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const path = new URL(request.url()).pathname
      .replace(/^\//, '')
      .replace(/\.json$/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const method = request.method();

    if (method === 'GET') {
      const value = readAt(database, path);
      const headers = request.headers()['x-firebase-etag'] === 'true' ? { etag: firebaseEtag(value) } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ...headers }, body: JSON.stringify(value) });
      return;
    }

    if (failWrites && ['PUT', 'PATCH', 'DELETE'].includes(method)) {
      await route.fulfill({ status: 500, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'e2e write failure' }) });
      return;
    }
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    if (writeDelayMs) await new Promise(resolve => setTimeout(resolve, writeDelayMs));
    const current = readAt(database, path);
    const ifMatch = request.headers()['if-match'];
    if (ifMatch && ifMatch !== firebaseEtag(current)) {
      await route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'etag mismatch' }) });
      return;
    }
    if (method === 'PUT') writeAt(database, path, body);
    else if (method === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (method === 'DELETE') writeAt(database, path, null);

    await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, etag: firebaseEtag(readAt(database, path)) }, body: JSON.stringify(body) });
  });
  Object.defineProperty(unexpectedHosts, 'setNetworkAvailable', {
    value: value => { networkAvailable = !!value; },
    enumerable: false
  });
  Object.defineProperty(unexpectedHosts, 'setWriteFailure', {
    value: value => { failWrites = !!value; },
    enumerable: false
  });
  return unexpectedHosts;
}

async function loginControlRole(page, user) {
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(login.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#app')).toBeVisible();
}

async function openControlTunnel(page, loginFirst = false, user = login.user) {
  if (loginFirst) await loginControlRole(page, user);
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId(user === 'E2E_CONTROL_CARGADOR' ? 'home-qc-carga' : 'home-control').click();
  const overlay = page.locator('#control-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: user === 'E2E_CONTROL_CARGADOR' ? 'Check Carga Injerto' : 'Check Túnel' }).click();
  return overlay;
}

async function startControlTest(page, database, user = login.user, writeDelayMs = 0) {
  const unexpectedHosts = await interceptFirebase(page, database, writeDelayMs);
  // El 30/06/2026 pertenece a la segunda quincena del calendario de la app;
  // la prueba queda estable aunque se ejecute en otra fecha.
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  const overlay = await openControlTunnel(page, true, user);
  return { overlay, unexpectedHosts };
}

async function startControlSecondaryTest(page, database, writeDelayMs = 0) {
  const unexpectedHosts = await interceptFirebase(page, database, writeDelayMs);
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  const overlay = await openControlTunnel(page);
  return { overlay, unexpectedHosts };
}

async function createNewTunnelLine(overlay, partida) {
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  await form.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await form.locator('#nc-partida').fill(partida);
  await form.locator('#nc-bandejas').fill('12');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  const card = overlay.locator('[data-testid^="qc-v6-card-"]').filter({ hasText: partida });
  await expect(card).toBeVisible();
  return card;
}

async function createNewCargaV6Line(overlay, partida) {
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  await form.locator('#ncc-cliente').selectOption({ label: 'Fixture carga' });
  await form.locator('#ncc-partida').fill(partida);
  await form.locator('#ncc-variedad').selectOption({ label: 'CALABACÍN' });
  await form.locator('#ncc-bandejas').fill('12');
  await form.locator('#ncc-inv').selectOption('17');
  await form.locator('#ncc-calle-desde').selectOption('4');
  await form.locator('#ncc-calle-hasta').selectOption('4');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  const card = overlay.locator('[data-testid^="qc-v6-card-"]').filter({ hasText: partida });
  await expect(card).toBeVisible();
  return card;
}

async function expectControlUsableAtViewport(page, viewport) {
  await page.setViewportSize(viewport);
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await expect(overlay.getByRole('button', { name: 'Check Túnel' })).toBeVisible();
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  const dimensions = await overlay.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(unexpectedHosts).toEqual([]);
}

test('UAT-025 y UAT-129: Control carga el periodo y abre en la fecha local actual', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const fortnightLabel = overlay.getByTestId('control-quincena-label');
  await expect(fortnightLabel).toContainText('Quincena 2');
  await expect(overlay.getByTestId('control-day-30')).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('E2E-QUINCENA-ANTERIOR', { exact: true })).toHaveCount(0);

  await overlay.getByTestId('control-quincena-previous').click();
  await expect(fortnightLabel).toContainText('Quincena 1');
  await expect(overlay.getByText('E2E-QUINCENA-ANTERIOR', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toHaveCount(0);

  await overlay.getByTestId('control-quincena-next').click();
  await expect(fortnightLabel).toContainText('Quincena 2');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('E2E-QUINCENA-ANTERIOR', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-056, UAT-057 y UAT-059: Control conserva la sesión y los datos abiertos sin red y se recupera al volver', async ({ page, context }) => {
  const database = fixtureDatabase();
  const unexpectedHosts = await interceptFirebase(page, database);
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  const overlay = await openControlTunnel(page, true);
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();

  await context.setOffline(true);
  unexpectedHosts.setNetworkAvailable(false);
  await expect(page.locator('#app')).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await overlay.getByTestId('control-quincena-previous').click();
  await expect(overlay.getByTestId('control-quincena-label')).toContainText('Quincena 1');
  await expect(overlay.getByText('E2E-QUINCENA-ANTERIOR', { exact: true })).toBeVisible();

  unexpectedHosts.setNetworkAvailable(true);
  await context.setOffline(false);
  await expect(page.locator('#app')).toBeVisible();
  await overlay.getByTestId('control-quincena-next').click();
  await expect(overlay.getByTestId('control-quincena-label')).toContainText('Quincena 2');
  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-058 y UAT-060: recargar sin conexión conserva la sesión, avisa del fallo de carga y permite continuar al reconectar', async ({ page, context }) => {
  const user = 'VIGUERAS';
  const database = fixtureDatabase(user);
  const unexpectedHosts = await interceptFirebase(page, database);
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  await loginControlRole(page, user);
  const overlay = await openControlTunnel(page, false, user);
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();

  await context.setOffline(true);
  unexpectedHosts.setNetworkAvailable(false);
  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#aviso-fallo-guardado')).toContainText('No se han podido cargar los datos');
  const unavailableOverlay = await openControlTunnel(page, false, user);
  await expect(unavailableOverlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await expect(page.locator('#aviso-fallo-guardado')).toContainText('No se han podido cargar los datos');

  unexpectedHosts.setNetworkAvailable(true);
  await context.setOffline(false);
  await unavailableOverlay.getByRole('button', { name: '✕ Cerrar' }).click();
  const recoveredOverlay = await openControlTunnel(page, false, user);
  await expect(recoveredOverlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(page.locator('#aviso-fallo-guardado')).toBeHidden();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-128 y UAT-130: Check Túnel organiza el día y cambia entre días sin mezclar líneas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  for (const heading of ['Fecha de trabajo', 'Operativa del día', 'Inspecciones']) {
    await expect(overlay.getByText(heading, { exact: true })).toHaveCount(1);
  }
  await expect(overlay.getByRole('button', { name: /Dashboard del día/ })).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: /Exportar CSV del día/ })).toHaveCount(0);

  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-29');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-30');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-131 y UAT-132: elegir una fecha de otra quincena y volver al día actual', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const datePicker = overlay.getByTestId('control-date-picker');
  await datePicker.fill('2026-07-01');
  await datePicker.dispatchEvent('change');
  await expect(datePicker).toHaveValue('2026-07-01');
  await expect(overlay.getByTestId('control-quincena-label')).toContainText('Quincena 2');
  await expect(overlay.getByText('E2E-QUINCENA-SIGUIENTE-DIA-01', { exact: true })).toBeVisible();

  await overlay.getByTestId('control-day-today').click();
  await expect(datePicker).toHaveValue('2026-06-30');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-SIGUIENTE-DIA-01', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-231 y UAT-233: volver a abrir QC Carga en la misma sesión sin duplicar controles', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toBeVisible();
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toHaveCount(1);
  await expect(overlay.getByTestId('control-day-operations')).toHaveCount(1);
  await expect(overlay.getByTestId('control-inspections')).toHaveCount(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-234–239: QC Carga organiza los días, cambia de quincena y vuelve sin mezclar tipos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const datePicker = overlay.getByTestId('control-date-picker');
  await expect(datePicker).toHaveValue('2026-06-30');
  for (const heading of ['Fecha de trabajo', 'Operativa del día', 'Inspecciones']) {
    await expect(overlay.getByText(heading, { exact: true })).toHaveCount(1);
  }
  await expect(overlay.getByRole('button', { name: /Dashboard del día/ })).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: /Exportar CSV del día/ })).toHaveCount(0);
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);

  await overlay.getByTestId('control-day-previous').click();
  await expect(datePicker).toHaveValue('2026-06-29');
  await expect(overlay.getByText('E2E-CARGA-DIA-ANTERIOR', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toHaveCount(0);
  await overlay.getByTestId('control-day-next').click();
  await expect(datePicker).toHaveValue('2026-06-30');
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toBeVisible();

  await datePicker.fill('2026-07-01');
  await datePicker.dispatchEvent('change');
  await expect(datePicker).toHaveValue('2026-07-01');
  await expect(overlay.getByTestId('control-quincena-label')).toContainText('Quincena 2');
  await expect(overlay.getByText('E2E-CARGA-OTRA-QUINCENA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-SIGUIENTE-DIA-01', { exact: true })).toHaveCount(0);

  await overlay.getByTestId('control-day-today').click();
  await expect(datePicker).toHaveValue('2026-06-30');
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-240, UAT-241, UAT-246 y UAT-267: Carga consulta el histórico y no permite altas pasadas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const datePicker = overlay.getByTestId('control-date-picker');
  await datePicker.fill('2026-06-29');
  await datePicker.dispatchEvent('change');
  await expect(overlay.getByText('E2E-CARGA-DIA-ANTERIOR', { exact: true })).toBeVisible();
  await expect(overlay.getByTestId('control-add-line')).toHaveCount(0);

  await datePicker.fill('2026-06-28');
  await datePicker.dispatchEvent('change');
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  for (const heading of ['Fecha de trabajo', 'Operativa del día', 'Inspecciones']) {
    await expect(overlay.getByText(heading, { exact: true })).toHaveCount(1);
  }
  await expect(overlay.getByTestId('control-add-line')).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-247–257: filtros, ubicaciones, estados y contadores de QC Carga respetan su alcance', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const select = overlay.getByTestId('control-inspections').locator('select').first();
  await expect(select.locator('option').first()).toHaveText('Todos los invernaderos');
  await expect(select.locator('optgroup')).toHaveCount(5);
  await expect(select).not.toHaveAttribute('multiple', 'multiple');
  await expect(overlay.getByTestId('control-day-operations').locator('select')).toHaveCount(0);

  await select.selectOption('1A');
  await select.selectOption('17');
  await expect(select).toHaveValue('17');
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight-completed')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-other-greenhouse')).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: 'Todos (3)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '✓ Completados (1)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '○ Pendientes (2)' })).toBeVisible();
  await overlay.getByRole('button', { name: '✓ Completados (1)' }).click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight-completed')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toHaveCount(0);
  await overlay.getByRole('button', { name: '○ Pendientes (2)' }).click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();

  await overlay.getByTestId('control-day-previous').click();
  await expect(select).toHaveValue('17');
  await expect(overlay.locator('#control-card-e2e-control-carga-previous-day')).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Todos (1)' })).toBeVisible();
  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-28');
  await expect(overlay.getByTestId('control-inspections').locator('select')).toHaveCount(1);
  await expect(select).toHaveValue('17');
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  await overlay.getByTestId('control-day-next').click();
  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-30');
  await expect(select).toHaveValue('17');

  await select.selectOption('18');
  await expect(overlay.locator('#control-card-e2e-control-carga-other-greenhouse')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toHaveCount(0);
  await select.selectOption('20');
  const legacyCard = overlay.locator('#control-card-e2e-control-carga-legacy-location');
  await expect(legacyCard).toBeVisible();
  await expect(legacyCard).toContainText('18-20');
  await expect(legacyCard).not.toContainText('20A');
  await expect(legacyCard).not.toContainText('20B');

  await select.selectOption('');
  await expect(overlay.locator('#control-card-e2e-control-carga-unassigned')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-258–263: buscar partidas y presentar la inspección y ubicación de Carga correctamente', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const select = overlay.getByTestId('control-inspections').locator('select').first();
  await select.selectOption('17');
  await overlay.getByRole('button', { name: /Pendientes/ }).click();
  const search = overlay.locator('#control-buscar-partida');
  await search.fill('E2E-CARGA-QUINCENA-ACTUAL');
  await search.press('Enter');
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  await expect(overlay.getByTestId('control-status-e2e-control-carga-current-fortnight')).toHaveText('Pendiente');

  await search.fill('NO-EXISTE-E2E');
  await search.press('Enter');
  await expect(page.getByText('No se ha encontrado ninguna línea con esa partida')).toBeVisible();
  await expect(select).toHaveValue('17');
  await expect(overlay.getByRole('button', { name: /Pendientes/ })).toBeVisible();

  await overlay.getByRole('button', { name: /Todos/ }).click();
  const completed = overlay.locator('#control-card-e2e-control-carga-current-fortnight-completed');
  await expect(completed.getByTestId('control-status-e2e-control-carga-current-fortnight-completed')).toHaveText('Inspeccionado');
  const cardText = await completed.innerText();
  const expectedOrder = [
    'E2E-CARGA-COMPLETADA', 'Inspeccionado', 'Cliente: Fixture carga completada',
    'Variedad: CALABACÍN', 'Bandejas declaradas: 10', 'Invernadero: INV 17', 'Calle: 9'
  ];
  const positions = expectedOrder.map(text => cardText.indexOf(text));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a,b) => a-b));

  await select.selectOption('20');
  const legacy = overlay.locator('#control-card-e2e-control-carga-legacy-location');
  await expect(legacy).toContainText('Invernadero: INV 20');
  await expect(legacy).toContainText('Calle: 18-20');
  await expect(legacy).not.toContainText('20A');
  await expect(legacy).not.toContainText('20B');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2393: la búsqueda de QC Carga no se hereda en el buscador global de Partidas', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const cargaSearch = overlay.locator('#control-buscar-partida');
  await cargaSearch.fill('E2E-CARGA-QUINCENA-ACTUAL');
  await cargaSearch.press('Enter');
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-current-fortnight')).toHaveCount(0);

  await overlay.getByRole('button', { name: /✕/ }).last().click();
  await expect(overlay).toBeHidden();
  await page.getByTestId('home-partidas').click();
  const partidas = page.locator('#partidas-overlay');
  await expect(partidas).toBeVisible();
  await partidas.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await partidas.getByRole('button', { name: '17', exact: true }).click();
  const globalSearch = partidas.getByPlaceholder('Buscar Nº partida...');
  await expect(globalSearch).toHaveValue('');
  await globalSearch.fill('E2E-CARGA-QUINCENA-ACTUAL');
  await globalSearch.press('Enter');
  await expect(page.getByText('No se ha encontrado ninguna partida con ese número')).toBeVisible();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeHidden();

  await globalSearch.fill('E2E-QUINCENA-ACTUAL-DIA-30');
  await globalSearch.press('Enter');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-QUINCENA-ACTUAL-DIA-30');
  await history.getByRole('button', { name: 'Cerrar' }).click();
  await expect(history).toBeHidden();
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-285 y UAT-291: editar los datos de Carga conserva la ubicación heredada si no se modifica', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  await card.getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await expect(editor.getByText('Editar línea', { exact: true })).toBeVisible();
  await expect(editor.locator('#ecc-partida')).toHaveValue('E2E-CARGA-QUINCENA-ACTUAL');
  await expect(editor.locator('#ecc-inv')).toHaveValue('17');
  await expect(editor.locator('#ecc-calle-desde')).toHaveValue('8');
  await expect(editor.locator('#ecc-calle-hasta')).toHaveValue('8');
  await editor.locator('#ecc-cliente').selectOption('CLIENTE CATÁLOGO B');
  await editor.locator('#ecc-variedad').selectOption('PEPINO');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => database['lasala-control-items-v1'][id].cliente).toBe('CLIENTE CATÁLOGO B');
  await expect.poll(() => database['lasala-control-items-v1'][id].variedad).toBe('PEPINO');
  await expect.poll(() => database['lasala-control-items-v1'][id].invernadero).toBe('17-8-8');
  await expect(overlay.locator(`#control-card-${id}`)).toContainText('CLIENTE CATÁLOGO B');
  await expect(overlay.locator(`#control-card-${id}`)).toContainText('Calle: 8');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-287: el editor de Carga restringe Cliente/Variedad a parejas del catálogo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await expect(editor.locator('#ecc-cliente')).toBeVisible();
  await expect(editor.locator('#ecc-cliente')).toHaveJSProperty('tagName', 'SELECT');
  await editor.locator('#ecc-cliente').selectOption('CLIENTE CATÁLOGO B');
  await expect(editor.locator('#ecc-variedad')).toHaveJSProperty('tagName', 'SELECT');
  await expect(editor.locator('#ecc-variedad option')).toHaveText(['— Variedad —', 'PEPINO']);
  await editor.locator('#ecc-variedad').evaluate(select => select.add(new Option('Pareja no válida', 'CALABACÍN')));
  await editor.locator('#ecc-variedad').selectOption('CALABACÍN');
  const original = structuredClone(database['lasala-control-items-v1'][id]);
  const writes = [];
  page.on('request', request => { if(firebaseUrl.test(request.url()) && ['PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.url()); });
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#app-toast')).toContainText('pareja Cliente/Variedad disponible en el catálogo');
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toHaveLength(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-288: cambiar ubicación de Carga guarda INV/calles y los recupera al reabrir', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  await card.getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await editor.locator('#ecc-inv').selectOption('18');
  const calle = await editor.locator('#ecc-calle-desde option').nth(1).getAttribute('value');
  await editor.locator('#ecc-calle-desde').selectOption(calle);
  await editor.locator('#ecc-calle-hasta').selectOption(calle);
  await editor.getByRole('button', { name: 'Guardar' }).click();
  const ubicacion = `18-${calle}-${calle}`;
  await expect.poll(() => database['lasala-control-items-v1'][id].invernadero).toBe(ubicacion);
  await page.reload();
  const reopenedOverlay = await openControlTunnel(page);
  await reopenedOverlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await reopenedOverlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const reopenedEditor = page.locator('#control-editar-carga-overlay');
  await expect(reopenedEditor.locator('#ecc-inv')).toHaveValue('18');
  await expect(reopenedEditor.locator('#ecc-calle-desde')).toHaveValue(calle);
  await expect(reopenedEditor.locator('#ecc-calle-hasta')).toHaveValue(calle);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-289: editar Carga conserva exactamente la ubicación compacta heredada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-legacy-location';
  const original = database['lasala-control-items-v1'][id].invernadero;
  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await expect(editor.locator('#ecc-inv')).toHaveValue('20');
  await expect(editor.locator('#ecc-calle-desde')).toHaveValue('18');
  await expect(editor.locator('#ecc-calle-hasta')).toHaveValue('20');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => database['lasala-control-items-v1'][id].invernadero).toBe(original);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-290: el editor de Carga rechaza calles inexistentes y ubicaciones duplicadas', async ({ page }) => {
  const database = fixtureDatabase();
  const duplicateId = 'e2e-control-carga-duplicate-target';
  database['lasala-control-items-v1'][duplicateId] = {
    id:duplicateId, tipo:'carga', dia:30, cliente:'Fixture carga', partida:'E2E-CARGA-QUINCENA-ACTUAL',
    variedad:'CALABACÍN', numBandejas:3, invernadero:'17-4-4'
  };
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  const original = structuredClone(database['lasala-control-items-v1'][id]);
  const writes = [];
  page.on('request', request => { if(firebaseUrl.test(request.url()) && ['PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.url()); });
  await editor.locator('#ecc-calle-desde').evaluate(select => select.add(new Option('9999','9999')));
  await editor.locator('#ecc-calle-desde').selectOption('9999');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#app-toast')).toContainText('calles válidas');
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toHaveLength(0);

  await editor.locator('#ecc-inv').selectOption('17');
  await editor.locator('#ecc-calle-desde').selectOption('4');
  await editor.locator('#ecc-calle-hasta').selectOption('4');
  await editor.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#app-toast')).toContainText('Ya existe esa partida en la misma fecha y ubicación');
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toHaveLength(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-293: el editor de Carga bloquea mover una línea a una fecha pasada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await editor.locator('#ecc-dia').selectOption('29');
  await editor.getByRole('button', { name: 'Guardar' }).click();

  await expect(page.locator('#app-toast')).toContainText('No se puede mover una línea a una fecha pasada');
  await expect(editor).toBeVisible();
  expect(database['lasala-control-items-v1'][id].dia).toBe(30);
  expect(database['lasala-control-items-v1'][id].invernadero).toBe('17-8-8');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-292: el editor de Carga permite mover una línea a una fecha futura y conserva sus datos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-carga-overlay');
  await editor.locator('#ecc-dia').selectOption('32');
  await editor.getByRole('button', { name: 'Guardar' }).click();

  await expect.poll(() => database['lasala-control-items-v1'][id].dia).toBe(32);
  expect(database['lasala-control-items-v1'][id]).toMatchObject({
    cliente: 'Fixture carga',
    partida: 'E2E-CARGA-QUINCENA-ACTUAL',
    variedad: 'CALABACÍN',
    numBandejas: '14',
    invernadero: '17-8-8'
  });
  await overlay.getByTestId('control-date-picker').fill('2026-07-02');
  await overlay.getByTestId('control-date-picker').dispatchEvent('change');
  await expect(overlay.locator(`#control-card-${id}`)).toBeVisible();
  await expect(overlay.locator(`#control-card-${id}`)).toContainText('E2E-CARGA-QUINCENA-ACTUAL');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-281 y UAT-282: CARGADOR abre la inspección desde la tarjeta y mantiene la identidad completa', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_CARGADOR: 'CARGADOR' });
  const { overlay, unexpectedHosts } = await startControlTest(page, database, 'E2E_CONTROL_CARGADOR');
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const partida = 'E2E-CARGA-QUINCENA-ACTUAL';
  const cliente = 'Fixture carga';
  const id = 'e2e-control-carga-current-fortnight';
  const tarjeta = overlay.locator(`#control-card-${id}`);
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText(partida);
  await expect(tarjeta).toContainText(cliente);
  await expect(tarjeta).toContainText('CALABACÍN');
  await expect(tarjeta).toContainText('Bandejas declaradas: 14');
  await expect(tarjeta).toContainText('INV 17');
  // La evaluación está disponible desde la tarjeta; no hace falta abrir el número.
  await expect(tarjeta.getByTestId(`control-option-${id}-color-ok`)).toBeVisible();
  expect(database['lasala-control-items-v1']['e2e-control-carga-current-fortnight']).toMatchObject({
    partida,
    cliente,
    variedad: 'CALABACÍN',
    numBandejas: 14,
    invernadero: '17-8-8'
  });
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-283: cerrar y reabrir una inspección de Carga intacta no avisa de cambios pendientes', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_CARGADOR: 'CARGADOR' });
  const { overlay, unexpectedHosts } = await startControlTest(page, database, 'E2E_CONTROL_CARGADOR');
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const card = overlay.locator('#control-card-e2e-control-carga-current-fortnight');
  await expect(card).toBeVisible();
  await overlay.getByRole('button', { name: /Cerrar/ }).click();
  await expect(overlay).toBeHidden();
  await page.getByTestId('home-qc-carga').click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  expect(dialogs).toEqual([]);
  expect(database['lasala-control-items-v1']['e2e-control-carga-current-fortnight'].color).toBeUndefined();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-284: QC Carga permite conservar o descartar un cambio pendiente al salir de la ficha', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  const option = card.getByTestId(`control-option-${id}-color-verde`);
  await option.click();
  await expect(option).toContainText('✓');
  await expect(card.getByTestId(`control-carga-save-${id}`)).toBeVisible();

  let confirmation = '';
  page.once('dialog', async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-07-01');
  expect(confirmation).toContain('cambios de calidad sin guardar');
  expect(database['lasala-control-items-v1'][id].color?.verde).toBeUndefined();

  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay.locator(`#control-card-${id}`).getByTestId(`control-option-${id}-color-verde`)).not.toContainText('✓');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-242: QC Carga cambia de fecha sin alertar cuando ninguna inspección se ha modificado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const date = overlay.getByTestId('control-date-picker');
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  await overlay.getByTestId('control-day-previous').click();
  await expect(date).toHaveValue('2026-06-29');
  await overlay.getByTestId('control-day-next').click();
  await expect(date).toHaveValue('2026-06-30');
  expect(dialogs).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-243: QC Carga avisa, conserva el borrador al cancelar y lo guarda al confirmar', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  const color = card.getByTestId(`control-option-${id}-color-verde`);
  const date = overlay.getByTestId('control-date-picker');
  const dialogMessages = [];
  page.on('dialog', async dialog => { dialogMessages.push(dialog.message()); await dialog.dismiss(); });

  await color.click();
  await expect(color).toContainText('✓');
  await expect(card.getByTestId(`control-carga-save-${id}`)).toBeVisible();
  expect(database['lasala-control-items-v1'][id].color?.verde).toBeUndefined();
  await overlay.getByTestId('control-day-previous').click();

  await expect.poll(() => dialogMessages.length).toBe(1);
  await expect(dialogMessages[0]).toContain('cambios de calidad sin guardar');
  await expect(date).toHaveValue('2026-06-30');
  await expect(card.getByTestId(`control-option-${id}-color-verde`)).toContainText('✓');
  expect(database['lasala-control-items-v1'][id].color?.verde).toBeUndefined();
  await card.getByTestId(`control-carga-save-${id}`).click();
  await expect.poll(() => database['lasala-control-items-v1'][id].color?.verde).toBe(true);
  await expect(card.getByTestId(`control-carga-save-${id}`)).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-244: QC Carga pide confirmación antes de cambiar a Túnel con un borrador pendiente', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  const pending = card.getByTestId(`control-option-${id}-color-verde`);
  const dialogMessages = [];
  page.on('dialog', async dialog => { dialogMessages.push(dialog.message()); await dialog.dismiss(); });

  await pending.click();
  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  await expect.poll(() => dialogMessages.length).toBe(1);
  await expect(dialogMessages[0]).toContain('cambios de calidad sin guardar');
  await expect(card).toBeVisible();
  await expect(card.getByTestId(`control-option-${id}-color-verde`)).toContainText('✓');
  expect(database['lasala-control-items-v1'][id].color?.verde).toBeUndefined();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-295: las acciones de la tarjeta Carga son identificables y cómodas al tacto', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  const edit = card.getByRole('button', { name: 'Editar partida' });
  const remove = card.getByRole('button', { name: 'Eliminar línea' });
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(edit).toHaveCSS('min-height', '36px');
  await expect(remove).toHaveCSS('min-height', '36px');
  await expect(remove).toHaveCSS('background-color', 'rgb(253, 236, 234)');

  let message = '';
  page.once('dialog', async dialog => {
    message = dialog.message();
    await dialog.dismiss();
  });
  await remove.click();
  expect(message).toContain('Fixture carga');
  await expect(card).toBeVisible();
  expect(database['lasala-control-items-v1'][id]).toBeTruthy();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-296: cancelar el borrado de una línea Carga conserva la medición QC pendiente', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const id='e2e-control-carga-current-fortnight';
  const card=overlay.locator(`#control-card-${id}`);
  await card.getByTestId(`control-option-${id}-color-verde`).click();
  await expect(card.getByTestId(`control-option-${id}-color-verde`)).toContainText('✓');
  const message=[];
  page.once('dialog', async dialog=>{message.push(dialog.message());await dialog.dismiss();});
  await card.getByTestId(`control-delete-${id}`).click();
  await expect.poll(()=>message.length).toBe(1);
  expect(message[0]).toContain('Fixture carga');
  await expect(card.getByTestId(`control-option-${id}-color-verde`)).toContainText('✓');
  expect(database['lasala-control-items-v1'][id].color?.verde).toBeUndefined();
  expect(database['lasala-control-items-v1'][id]).toBeTruthy();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-297: confirmar el borrado de una Carga con inspección abierta cierra esa ficha y elimina solo la línea', async ({ page }) => {
  const database=fixtureDatabase();
  const {overlay,unexpectedHosts}=await startControlTest(page,database);
  const card=await createNewCargaV6Line(overlay,'26X09006');
  const id=await card.getAttribute('data-testid').then(value=>value.replace('qc-v6-card-',''));
  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  const message=[];
  page.once('dialog',async dialog=>{message.push(dialog.message());await dialog.accept();});
  await card.getByRole('button', { name: 'Eliminar línea' }).click();
  await expect.poll(()=>message.length).toBe(1);
  expect(message[0]).toContain('Fixture carga');
  await expect(overlay.locator(`#control-card-${id}`)).toHaveCount(0);
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  expect(database['lasala-control-items-v1'][id]).toBeUndefined();
  expect(Object.values(database['lasala-control-items-v1']).map(item=>item.partida)).not.toContain('26X09006');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-245 y UAT-354: QC Carga permite recorrer el día en móvil vertical/horizontal y editar una línea', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.getByTestId('control-date-picker')).toBeVisible();
  await expect(overlay.getByTestId('control-inspections')).toBeVisible();
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  const id = 'e2e-control-carga-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId(`control-option-${id}-color-ok`)).toBeVisible();
  await expect(card.getByTestId(`control-option-${id}-tamano-ok`)).toBeVisible();
  await expect(card.getByTestId(`control-option-${id}-raices-ok`)).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(overlay.getByTestId('control-date-picker')).toBeVisible();
    await expect(overlay.getByTestId('control-day-previous')).toBeVisible();
    await expect(overlay.getByTestId('control-day-next')).toBeVisible();
    await expect(overlay.getByTestId('control-inspections')).toBeVisible();
    await expect(overlay.getByTestId('control-add-line')).toBeVisible();
    const dimensions = await overlay.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await card.getByTestId(`control-edit-${id}`).click();
  await expect(page.locator('#control-editar-carga-overlay')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-340, UAT-345, UAT-346, UAT-347, UAT-348 y UAT-433: Carga mantiene sus herramientas PDF y no hereda extensiones al alternar', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const cargaCards = overlay.locator('[id^="control-card-e2e-control-carga-"]');
  await expect(overlay.locator('label').filter({ hasText: 'Añadir extensiones' })).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toHaveCount(0);
  await expect(overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')).toHaveCount(1);
  await expect(overlay.getByRole('button', { name: /Dashboard del día|Exportar CSV del día/ })).toHaveCount(0);
  await expect(cargaCards).toHaveCount(7);
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-carga-other-greenhouse')).toBeVisible();

  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(overlay.locator('#control-card-e2e-control-current-fortnight')).toBeVisible();
  await expect(overlay.locator('[id^="control-card-e2e-control-carga-"]')).toHaveCount(0);
  await expect(overlay.locator('label').filter({ hasText: 'Añadir extensiones' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toBeVisible();

  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-current-fortnight')).toHaveCount(0);
  await expect(overlay.locator('label').filter({ hasText: 'Añadir extensiones' })).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toHaveCount(0);

  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(overlay.locator('label').filter({ hasText: 'Añadir extensiones' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.getByRole('button', { name: 'Añadir extensiones' })).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-219 y UAT-432: QC Túnel ofrece sus herramientas PDF y extensiones sin Dashboard ni CSV operativo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await expect(overlay.locator('label').filter({ hasText: 'Añadir extensiones' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Comprobar extensiones' })).toBeVisible();
  await expect(overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')).toHaveCount(1);
  await expect(overlay.getByRole('button', { name: /Dashboard del día|Exportar CSV del día/ })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-166 y UAT-215: crear, volver a buscar y evaluar una línea QC Túnel', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_TECNICO: 'TECNICO' });
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const adminCard = await createNewTunnelLine(overlay, '26X09001');
  const adminId = (await adminCard.getAttribute('id')).replace('control-card-', '');
  const search = overlay.locator('#control-buscar-partida');
  await search.fill('26X09001');
  await overlay.getByTitle('Buscar').click();
  await expect(overlay.locator(`#control-card-${adminId}`)).toBeVisible();
  await expect(adminCard.getByTestId(`qc-v6-${adminId}-save`)).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).filter(item => item.partida === '26X09001')).toHaveLength(1);

  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await loginControlRole(page, 'E2E_CONTROL_TECNICO');
  await page.getByTestId('home-control').click();
  const tecnicoOverlay = page.locator('#control-overlay');
  await expect(tecnicoOverlay).toBeVisible();
  await tecnicoOverlay.getByRole('button', { name: 'Check Túnel' }).click();
  await createNewTunnelLine(tecnicoOverlay, '26X09002');
  expect(Object.values(database['lasala-control-items-v1']).map(item => item.partida)).toEqual(expect.arrayContaining(['26X09001', '26X09002']));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-335 y UAT-355: CARGADOR registra una línea QC Carga autorizada también en vista móvil', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), {
    E2E_CONTROL_TECNICO: 'TECNICO', E2E_CONTROL_CARGADOR: 'CARGADOR'
  });
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await createNewCargaV6Line(overlay, '26X09003');
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();

  await loginControlRole(page, 'E2E_CONTROL_TECNICO');
  await page.getByTestId('home-control').click();
  const tecnicoOverlay = page.locator('#control-overlay');
  await expect(tecnicoOverlay).toBeVisible();
  await createNewCargaV6Line(tecnicoOverlay, '26X09004');
  await tecnicoOverlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await loginControlRole(page, 'E2E_CONTROL_CARGADOR');
  await page.getByTestId('home-qc-carga').click();
  const cargadorOverlay = page.locator('#control-overlay');
  await expect(cargadorOverlay).toBeVisible();
  await expect(cargadorOverlay.getByRole('button', { name: 'Check Túnel' })).toHaveCount(0);
  const datePicker = cargadorOverlay.getByTestId('control-date-picker');
  await expect(datePicker).toBeVisible();
  await datePicker.fill('2026-06-29');
  await datePicker.dispatchEvent('change');
  await expect(datePicker).toHaveValue('2026-06-29');
  await expect(cargadorOverlay.getByTestId('control-inspections')).toBeVisible();
  const cargaCard = await createNewCargaV6Line(cargadorOverlay, '26X09005');
  const cargaId = await cargaCard.getAttribute('data-testid').then(value => value.replace('qc-v6-card-', ''));
  for (const category of ['color', 'tamano', 'flores', 'raices']) {
    const option = cargaCard.getByTestId(`qc-v6-${cargaId}-${category}-ok`);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }
  await cargaCard.getByTestId(`qc-v6-${cargaId}-sanidad-ok`).click();
  await cargaCard.getByTestId(`qc-v6-${cargaId}-save`).click();
  await expect.poll(() => database['lasala-control-items-v1'][cargaId].qcV6?.color).toBe('ok');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(Object.values(database['lasala-control-items-v1']).map(item => item.partida)).toEqual(
    expect.arrayContaining(['26X09003', '26X09004', '26X09005'])
  );
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-336: REGANTE y PEÓN no pueden crear QC Carga mediante una llamada directa', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), {
    E2E_CONTROL_REGANTE: 'REGANTE', E2E_CONTROL_PEON: 'PEON'
  });
  const itemsBefore = JSON.stringify(database['lasala-control-items-v1']);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();

  let controlPutAttempts = 0;
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/lasala-control-items-v1.json')) controlPutAttempts++;
  });

  for (const [index, user] of ['E2E_CONTROL_REGANTE', 'E2E_CONTROL_PEON'].entries()) {
    if (index > 0) {
      await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
      await page.reload();
    }
    await loginControlRole(page, user);
    const result = await page.evaluate(async userId => {
      const entry = {
        id: `e2e-unauthorized-carga-${userId}`,
        tipo: 'carga',
        dia: 30,
        partida: '26X09999',
        cliente: 'Fixture no autorizado',
        variedad: 'No debe guardarse',
        numBandejas: 12
      };
      const countBefore = controlChecksData.length;
      const saved = await aplicarNuevaLineaControlCarga(entry);
      return {
        saved,
        countBefore,
        countAfter: controlChecksData.length,
        existsLocally: controlChecksData.some(item => item.id === entry.id)
      };
    }, user);

    expect(result.saved).toBe(false);
    expect(result.countAfter).toBe(result.countBefore);
    expect(result.existsLocally).toBe(false);
    expect(controlPutAttempts).toBe(0);
    expect(JSON.stringify(database['lasala-control-items-v1'])).toBe(itemsBefore);
    await page.getByRole('button', { name: 'Salir' }).click();
  }
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-341, UAT-342, UAT-438, UAT-453 y UAT-457: importar PDF Carga interpreta la plantilla, conserva origen y no duplica al repetir', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await page.evaluate(() => {
    window.loadScriptOnce = async () => {};
    const row = [
      ['07:30', 10], ['CLIENTE DEMO', 120], ['26X09999', 300],
      ['TOMATE INJERTADO', 430], ['12', 660], ['17-1-2', 730]
    ];
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: row.map(([str, x]) => ({ str, transform: [1, 0, 0, 1, x, 700] })) })
        })
      }) })
    };
  });
  const pdfBytes = Buffer.from('%PDF-1.4\\n% Fixture E2E QC Carga\\n%%EOF', 'utf8');
  const pdfInput = () => overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]');
  const file = { name: 'qc-carga-fixture.pdf', mimeType: 'application/pdf', buffer: pdfBytes };

  await pdfInput().setInputFiles(file);
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).filter(item => item.partida === '26X09999')).toHaveLength(1);
  expect(Object.values(database['lasala-control-items-v1']).find(item => item.partida === '26X09999')).toMatchObject({
    tipo: 'carga', dia: 30, cliente: 'CLIENTE DEMO', partida: '26X09999',
    variedad: 'TOMATE INJERTADO', numBandejas: '12', invernadero: '17-1-2', origenPdf: true
  });
  expect(JSON.parse(database['lasala-control-pdf-v1-carga-30'])).toMatchObject({ nombre: 'qc-carga-fixture.pdf' });
  expect(JSON.parse(database['lasala-control-pdf-v1-carga_normal-30'])).toMatchObject({ nombre: 'qc-carga-fixture.pdf' });

  await pdfInput().evaluate(input => { input.value = ''; });
  await pdfInput().setInputFiles(file);
  await expect(page.locator('#app-toast')).toContainText('PDF adjuntado (no se han detectado partidas nuevas que añadir)', { timeout: 15000 });
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).filter(item => item.partida === '26X09999')).toHaveLength(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-216: REGANTE y PEÓN no acceden a Control por la navegación ni por llamada directa', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), {
    E2E_CONTROL_REGANTE: 'REGANTE', E2E_CONTROL_PEON: 'PEON'
  });
  const itemsBefore = JSON.stringify(database['lasala-control-items-v1']);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();

  for (const user of ['E2E_CONTROL_REGANTE', 'E2E_CONTROL_PEON']) {
    if (user !== 'E2E_CONTROL_REGANTE') {
      await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
      await page.reload();
    }
    await loginControlRole(page, user);
    await page.evaluate(() => handleQuickAction('control'));
    await expect(page.locator('#control-overlay')).toBeHidden();
    expect(await page.evaluate(() => showControlModule())).toBe(false);
    await expect(page.locator('#control-overlay')).toBeHidden();
    await page.getByRole('button', { name: 'Salir' }).click();
  }

  expect(JSON.stringify(database['lasala-control-items-v1'])).toBe(itemsBefore);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-217 y UAT-337: CARGADOR solo abre QC Carga y no puede forzar captura o cambios de Túnel', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_CARGADOR: 'CARGADOR' });
  const tunnelBefore = JSON.stringify(database['lasala-control-items-v1']['e2e-control-current-fortnight']);
  const { overlay, unexpectedHosts } = await startControlTest(page, database, 'E2E_CONTROL_CARGADOR');

  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Check Túnel' })).toHaveCount(0);
  await page.evaluate(() => seleccionarSeccionControl('tunel'));
  expect(await page.evaluate(() => mostrarFormNuevoControlCheck('tunel'))).toBe(false);
  expect(await page.evaluate(() => aplicarControlCheckOpcion('e2e-control-current-fortnight', 'color', 'verde', true))).toBe(false);
  expect(JSON.stringify(database['lasala-control-items-v1']['e2e-control-current-fortnight'])).toBe(tunnelBefore);
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-365–367 y UAT-370: las fotos QC respetan el rol y no se filtran al cambiar de usuario', async ({ page }) => {
  const database = withControlRoles(fixtureDatabase(), {
    E2E_CONTROL_CARGADOR: 'CARGADOR',
    E2E_CONTROL_REGANTE: 'REGANTE',
    E2E_CONTROL_PEON: 'PEON'
  });
  const tunnelId = 'e2e-control-current-fortnight';
  const cargaId = 'e2e-control-carga-current-fortnight';
  const legacyPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=';
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({ [tunnelId]: 'lasala-control-fotos-v1' });
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  database['lasala-control-fotos-v1'] = JSON.stringify({ [tunnelId]: legacyPhoto });
  const { overlay, unexpectedHosts } = await startControlTest(page, database, 'E2E_CONTROL_CARGADOR');
  const cargaCard = overlay.locator(`#control-card-${cargaId}`);
  const tunnelCard = overlay.locator(`#control-card-${tunnelId}`);
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=', 'base64');

  await expect(overlay.getByRole('button', { name: 'Check Túnel' })).toHaveCount(0);
  await expect(cargaCard.locator('input[data-testid^="control-photo-gallery-"]')).toHaveCount(1);
  await expect(tunnelCard).toHaveCount(0);
  await cargaCard.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({ name: 'e2e-carga-authorized.png', mimeType: 'image/png', buffer: imageBytes });
  await expect(cargaCard.locator('img[title="Ver foto"]')).toBeVisible();
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-v1'])[cargaId]).toBeTruthy();

  const deniedTunnel = await page.evaluate(async ({ id, photo }) => {
    const input = document.createElement('input');
    const file = new File([new Uint8Array([1, 2, 3])], 'e2e-forbidden.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    const upload = await handleControlFotoInput(input, id);
    const save = await aplicarFotoControl(id, photo);
    mostrarFotoControlAmpliada(id);
    return { upload, save, enlarged: document.getElementById('control-foto-ampliada-overlay')?.style.display === 'flex' };
  }, { id: tunnelId, photo: legacyPhoto });
  expect(deniedTunnel).toEqual({ upload: false, save: false, enlarged: false });
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-v1'])[tunnelId]).toBe(legacyPhoto);

  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  for (const user of ['E2E_CONTROL_REGANTE', 'E2E_CONTROL_PEON']) {
    await page.getByRole('button', { name: 'Salir' }).click();
    await loginControlRole(page, user);
    await page.evaluate(() => handleQuickAction('control'));
    await expect(page.locator('#control-overlay')).toBeHidden();
    const denied = await page.evaluate(async ({ id, photo }) => {
      const saved = await aplicarFotoControl(id, photo);
      mostrarFotoControlAmpliada(id);
      return { saved, enlarged: document.getElementById('control-foto-ampliada-overlay')?.style.display === 'flex' };
    }, { id: cargaId, photo: legacyPhoto });
    expect(denied).toEqual({ saved: false, enlarged: false });
  }

  expect(JSON.parse(database['lasala-control-fotos-v1'])[tunnelId]).toBe(legacyPhoto);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-221–222, UAT-343–344, UAT-436, UAT-444 y UAT-445: QC Túnel y Carga conservan PDF históricos y no muestran documentos de otro día', async ({ page }) => {
  const database = fixtureDatabase();
  const historicalPdf = { nombre: 'QC-Tunel-29-jun.pdf', pdfB64: 'data:application/pdf;base64,JVBERi0xLjQK', subidoPor: 'E2E', subidoEn: '29/06/2026' };
  const historicalCargaPdf = { nombre: 'QC-Carga-29-jun.pdf', pdfB64: 'data:application/pdf;base64,JVBERi0xLjQK', subidoPor: 'E2E', subidoEn: '29/06/2026' };
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify(['tunel|29', 'carga|29', 'carga_normal|29']);
  database['lasala-control-pdf-v1-tunel-29'] = JSON.stringify(historicalPdf);
  database['lasala-control-pdf-v1-carga-29'] = JSON.stringify(historicalCargaPdf);
  database['lasala-control-pdf-v1-carga_normal-29'] = JSON.stringify(historicalCargaPdf);
  const itemIdsBefore = Object.keys(database['lasala-control-items-v1']).sort();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-29');
  await expect(overlay.locator('[data-testid="control-day-operations"] a[href^="data:application/pdf"]')).toBeVisible();
  await expect(overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')).toHaveCount(0);
  expect(database['lasala-control-pdf-v1-tunel-29']).toBe(JSON.stringify(historicalPdf));
  expect(Object.keys(database['lasala-control-items-v1']).sort()).toEqual(itemIdsBefore);

  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-29');
  await expect(overlay.locator('[data-testid="control-day-operations"] a[href^="data:application/pdf"]')).toBeVisible();
  await expect(overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')).toHaveCount(0);
  await expect(overlay.locator('[data-testid="control-day-operations"]')).toContainText('QC-Carga-29-jun.pdf');
  expect(database['lasala-control-pdf-v1-carga-29']).toBe(JSON.stringify(historicalCargaPdf));
  expect(database['lasala-control-pdf-v1-carga_normal-29']).toBe(JSON.stringify(historicalCargaPdf));
  expect(Object.keys(database['lasala-control-items-v1']).sort()).toEqual(itemIdsBefore);

  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.getByTestId('control-date-picker')).toHaveValue('2026-06-30');
  const dayOperations = overlay.locator('[data-testid="control-day-operations"]');
  await expect(dayOperations.locator('a[href^="data:application/pdf"]')).toHaveCount(0);
  await expect(dayOperations.locator('input[type="file"][accept="application/pdf"]')).toHaveCount(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-224 y UAT-460: consultar extensiones incluye los guiones de Túnel y no modifica ni mezcla Carga', async ({ page }) => {
  const database = fixtureDatabase();
  const items = database['lasala-control-items-v1'];
  const current = items['e2e-control-current-fortnight'];
  current.partida = 'E2E-EXTENSIONES-CON-GUIONES';
  current.clienteVariedad = 'Fixture guion de hoy';
  current.extensionFecha = '30/06/2026';
  current.extensionAplicadaEn = '2026-06-30T10:00:00';
  items['e2e-control-extension-previous-guion'] = {
    ...current,
    id: 'e2e-control-extension-previous-guion',
    dia: 29,
    clienteVariedad: 'Fixture guion anterior',
    calleDesde: 1703,
    calleHasta: 1703,
    extensionFecha: '29/06/2026',
    extensionAplicadaEn: '2026-06-29T10:00:00'
  };
  items['e2e-control-carga-extension-same-partida'] = {
    id: 'e2e-control-carga-extension-same-partida',
    tipo: 'carga',
    dia: 30,
    cliente: 'Fixture carga ajena',
    partida: 'E2E-EXTENSIONES-CON-GUIONES',
    variedad: 'CALABACÍN',
    numBandejas: 5,
    invernadero: '17-5-5',
    extensionFecha: '30/06/2026',
    extensionAplicadaEn: '2026-06-30T10:00:00'
  };
  const before = JSON.stringify(items);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await overlay.getByRole('button', { name: 'Comprobar extensiones' }).click();
  const report = page.locator('#control-listado-partidas-overlay');
  await expect(report).toBeVisible();
  await expect(report.getByText('Partidas con calle asignada por extensiones')).toBeVisible();
  await expect(report.getByText('(2)', { exact: true })).toBeVisible();
  await expect(report.getByText('Fixture guion anterior')).toBeVisible();
  await expect(report.getByText('Fixture guion de hoy')).toBeVisible();
  await expect(report.getByText('Fixture carga ajena')).toHaveCount(0);
  expect(JSON.stringify(database['lasala-control-items-v1'])).toBe(before);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-223: añadir extensiones reasigna el guion de Túnel existente y conserva su identidad', async ({ page }) => {
  const database = fixtureDatabase();
  const target = database['lasala-control-items-v1']['e2e-control-current-fortnight'];
  target.partida = '26X09999';
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await page.evaluate(() => {
    window.extraerLineasControlPdf = async () => [{ texto: '30/06/2026 26X09999 17 1703 1703' }];
  });

  await overlay.locator('input[type="file"][accept="application/pdf"]').first().setInputFiles({
    name: 'extensiones-fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF')
  });

  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight']).toMatchObject({
    id: 'e2e-control-current-fortnight', tipo: 'tunel', dia: 30, partida: '26X09999',
    extensionFecha: '30/06/2026', calleDesde: 3, calleHasta: 3
  });
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-225: las tarjetas de Túnel agrupan los guiones de una partida y permiten recorrerlos', async ({ page }) => {
  const database = fixtureDatabase();
  const items = database['lasala-control-items-v1'];
  const current = items['e2e-control-current-fortnight'];
  current.partida = '26X00077';
  items['e2e-control-previous-guion'] = {
    ...current, id: 'e2e-control-previous-guion', dia: 29, calleDesde: 1701, calleHasta: 1701
  };
  items['e2e-control-carga-same-partida'] = {
    ...current, id: 'e2e-control-carga-same-partida', tipo: 'carga', cliente: 'Fixture ajena', variedad: 'CALABACÍN'
  };
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await expect(overlay.getByText(/Guión 2 de 2/)).toBeVisible();
  await overlay.locator('button[title="Guión anterior"]').click();
  await expect(overlay.getByText(/Guión 1 de 2/)).toBeVisible();
  await expect(overlay.getByText('Fixture ajena', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-226–229: imprimir QC Túnel respeta día, invernadero y estado en página A4', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByTestId('control-greenhouse-filter').selectOption('17');
  await overlay.getByRole('button', { name: /Pendientes/ }).click();
  await overlay.getByTestId('control-tunnel-print').click();

  const printFrame = page.frameLocator('#print-control-listado-iframe');
  await expect(printFrame.locator('h1')).toContainText('QC Túnel');
  await expect(printFrame.locator('h1')).toContainText('INV 17');
  await expect(printFrame.locator('h1')).toContainText('Pendientes');
  await expect(printFrame.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(1);
  await expect(printFrame.getByText('E2E-QUINCENA-COMPLETADA', { exact: true })).toHaveCount(0);
  await expect(printFrame.getByText('E2E-QUINCENA-INV-18', { exact: true })).toHaveCount(0);
  await expect.poll(() => printFrame.locator('style').evaluate(element => element.textContent)).toContain('@page{size:A4 portrait');

  await page.locator('#control-listado-partidas-overlay').getByRole('button', { name: '✕' }).click();
  await overlay.getByTestId('control-day-previous').click();
  await overlay.getByTestId('control-tunnel-print').click();
  await expect(printFrame.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toHaveCount(1);
  await expect(printFrame.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-349–353: imprimir QC Carga respeta módulo, día, INV, estado y vista A4 sin reutilizar filas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const printButton = overlay.getByTestId('control-carga-print');
  await expect(printButton).toBeVisible();

  await overlay.getByTestId('control-greenhouse-filter').selectOption('17');
  await overlay.getByRole('button', { name: /Pendientes/ }).click();
  await printButton.click();
  const printFrame = page.frameLocator('#print-control-listado-iframe');
  await expect(printFrame.locator('h1')).toContainText('QC Carga');
  await expect(printFrame.locator('h1')).toContainText('INV 17');
  await expect(printFrame.locator('h1')).toContainText('Pendientes');
  await expect(printFrame.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toHaveCount(1);
  await expect(printFrame.getByText('E2E-CARGA-COMPLETADA', { exact: true })).toHaveCount(0);
  await expect(printFrame.getByText('E2E-CARGA-INV-18', { exact: true })).toHaveCount(0);
  await expect.poll(() => printFrame.locator('style').evaluate(element => element.textContent)).toContain('@page{size:A4 portrait');
  await expect.poll(() => printFrame.locator('style').evaluate(element => element.textContent)).toContain('break-inside:avoid');
  await expect(overlay).toBeVisible();

  await page.locator('#control-listado-partidas-overlay').getByRole('button', { name: '✕' }).click();
  await overlay.getByTestId('control-greenhouse-filter').selectOption('');
  await overlay.getByRole('button', { name: /Todos/ }).click();
  await overlay.getByTestId('control-day-previous').click();
  await printButton.click();
  await expect(printFrame.locator('h1')).toContainText('QC Carga');
  await expect(printFrame.getByText('E2E-CARGA-DIA-ANTERIOR', { exact: true })).toHaveCount(1);
  await expect(printFrame.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toHaveCount(0);
  await expect(printFrame.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toHaveCount(0);

  await page.locator('#control-listado-partidas-overlay').getByRole('button', { name: '✕' }).click();
  await overlay.getByTestId('control-date-picker').fill('2026-07-02');
  await overlay.getByTestId('control-date-picker').dispatchEvent('change');
  await printButton.click();
  await expect(printFrame.locator('h1')).toContainText('QC Carga');
  await expect(printFrame.locator('h1')).toContainText('(0)');
  await expect(printFrame.getByText('E2E-CARGA-DIA-ANTERIOR', { exact: true })).toHaveCount(0);
  await expect(printFrame.getByText(/E2E-QUINCENA-/)).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('PDF QC: subir y persistir una línea Túnel a partir de texto extraído (extracción simulada)', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await page.evaluate(() => {
    window.loadScriptOnce = async () => {};
    const mainRow = [
      ['0000001', 10], ['30/06/2026', 130], ['26X09999', 210], ['1,0', 290],
      ['CLIENTE DEMO', 370], ['100', 500], ['20.0', 600], ['17-1-2', 700], ['20/06/2026', 800]
    ];
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [
            ...mainRow.map(([str, x]) => ({ str, transform: [1, 0, 0, 1, x, 700] })),
            { str: 'TOMATE', transform: [1, 0, 0, 1, 237, 690] }
          ] })
        })
      }) })
    };
  });
  const pdfBytes = Buffer.from('%PDF-1.4\n% Texto interpretado por fixture E2E\n%%EOF', 'utf8');
  await overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]').setInputFiles({
    name: 'qc-tunel-fixture.pdf', mimeType: 'application/pdf', buffer: pdfBytes
  });

  await expect.poll(() => Object.values(database['lasala-control-items-v1']).find(x => x.partida === '26X09999')).toMatchObject({
    tipo: 'tunel', dia: 30, clienteVariedad: 'CLIENTE DEMO — TOMATE', numBandejas: '20', origenPdf: true
  });
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-232: QC Carga descarga una sola vez su módulo diferido al entrar en una sesión nueva', async ({ page }) => {
  const user = 'E2E_CONTROL_CARGADOR';
  const database = fixtureDatabase(user);
  database['lasala-roles-v1'] = JSON.stringify({ [user]: 'CARGADOR' });
  const unexpectedHosts = await interceptFirebase(page, database);
  const moduleRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/qc-v6.js') moduleRequests.push(request);
  });
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  await loginControlRole(page, user);
  expect(moduleRequests).toHaveLength(0);

  await page.getByTestId('home-qc-carga').click();
  const overlay = page.locator('#control-overlay');
  await expect(overlay).toBeVisible();
  await expect.poll(() => moduleRequests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => !!window.QC_V6)).toBe(true);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.locator('#control-card-e2e-control-carga-current-fortnight')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-358, UAT-359, UAT-360 y UAT-389–390: tarjeta QC sin controles de foto duplicados', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const database = fixtureDatabase();
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({});
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  for (const [id, section] of [['e2e-control-current-fortnight', null], ['e2e-control-carga-current-fortnight', 'Check Carga Injerto']]) {
    if (section) await overlay.getByRole('button', { name: section }).click();
    const card = overlay.locator(`#control-card-${id}`);
    await expect(card.getByText('Hacer foto', { exact: true })).toHaveCount(1);
    await expect(card.getByText('Elegir fotos', { exact: true })).toHaveCount(1);
    await expect(card.locator('img[title="Ver foto"]')).toHaveCount(0);
    await expect(card.getByTestId(`control-photo-camera-${id}`)).toHaveAttribute('capture', 'environment');
    await expect(card.getByTestId(`control-photo-gallery-${id}`)).not.toHaveAttribute('capture', /.+/);
    await expect(card.locator('input[data-testid^="control-photo-camera-"]')).toHaveCount(1);
    await expect(card.locator('input[data-testid^="control-photo-gallery-"]')).toHaveCount(1);
    const cameraAction = card.getByTestId(`control-photo-camera-${id}`).locator('xpath=..');
    const galleryAction = card.getByTestId(`control-photo-gallery-${id}`).locator('xpath=..');
    const cameraBox = await cameraAction.boundingBox();
    const galleryBox = await galleryAction.boundingBox();
    expect(cameraBox).not.toBeNull();
    expect(galleryBox).not.toBeNull();
    for (const box of [cameraBox, galleryBox]) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.width).toBeGreaterThan(70);
      expect(box.height).toBeGreaterThanOrEqual(28);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopCameraBox = await cameraAction.boundingBox();
    const desktopGalleryBox = await galleryAction.boundingBox();
    expect(desktopCameraBox).not.toBeNull();
    expect(desktopGalleryBox).not.toBeNull();
    expect(desktopCameraBox.x + desktopCameraBox.width).toBeLessThanOrEqual(desktopGalleryBox.x);
    expect(desktopGalleryBox.x + desktopGalleryBox.width).toBeLessThanOrEqual(1440);
    await page.setViewportSize({ width: 390, height: 844 });
  }

  expect(unexpectedHosts).toEqual([]);
});

test('UAT-047–049, UAT-356–357, UAT-364, UAT-368–369, UAT-392 y UAT-395: fotos QC y evaluación se conservan al cerrar ampliación', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({});
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const photos = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=', 'base64');
  const tunnelIds = ['e2e-control-current-fortnight', 'e2e-control-current-fortnight-second-line'];
  const cargaId = 'e2e-control-carga-current-fortnight';

  for (const id of tunnelIds) {
    const card = overlay.locator(`#control-card-${id}`);
    await card.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({ name: `${id}.png`, mimeType: 'image/png', buffer: photos });
    await expect(card.locator('img[title="Ver foto"]')).toBeVisible();
    await expect.poll(() => JSON.parse(database['lasala-control-fotos-indice-v1'] || '{}')[id]).toBe('lasala-control-fotos-v1');
  }

  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const cargaCard = overlay.locator(`#control-card-${cargaId}`);
  await expect(cargaCard).toBeVisible();
  await cargaCard.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({ name: `${cargaId}.png`, mimeType: 'image/png', buffer: photos });
  await expect(cargaCard.locator('img[title="Ver foto"]')).toBeVisible();
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-indice-v1'] || '{}')[cargaId]).toBe('lasala-control-fotos-v1');

  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  const previousDayId = 'e2e-control-current-fortnight-first-day';
  await overlay.getByTestId('control-day-previous').click();
  const previousDayCard = overlay.locator(`#control-card-${previousDayId}`);
  await expect(previousDayCard).toBeVisible();
  await previousDayCard.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({ name: `${previousDayId}.png`, mimeType: 'image/png', buffer: photos });
  await expect(previousDayCard.locator('img[title="Ver foto"]')).toBeVisible();
  await expect(overlay.locator(`#control-card-${tunnelIds[0]}`)).toHaveCount(0);
  await overlay.getByTestId('control-day-next').click();
  await expect(overlay.locator(`#control-card-${previousDayId}`)).toHaveCount(0);
  await expect(overlay.locator(`#control-card-${tunnelIds[0]} img[title="Ver foto"]`)).toBeVisible();

  const otherGreenhouseId = 'e2e-control-current-fortnight-other-greenhouse';
  await overlay.getByTestId('control-greenhouse-filter').selectOption('18');
  const otherGreenhouseCard = overlay.locator(`#control-card-${otherGreenhouseId}`);
  await expect(otherGreenhouseCard).toBeVisible();
  await otherGreenhouseCard.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles({ name: `${otherGreenhouseId}.png`, mimeType: 'image/png', buffer: photos });
  await expect(otherGreenhouseCard.locator('img[title="Ver foto"]')).toBeVisible();
  await overlay.getByTestId('control-greenhouse-filter').selectOption('17');
  await expect(overlay.locator(`#control-card-${otherGreenhouseId}`)).toHaveCount(0);
  await expect(overlay.locator(`#control-card-${tunnelIds[0]} img[title="Ver foto"]`)).toBeVisible();

  const shard = JSON.parse(database['lasala-control-fotos-v1']);
  for (const id of [...tunnelIds, cargaId]) expect(shard[id]).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  const reopened = page.locator('#control-overlay');
  await reopened.getByRole('button', { name: 'Check Túnel' }).click();
  for (const id of tunnelIds) await expect(reopened.locator(`#control-card-${id} img[title="Ver foto"]`)).toBeVisible();
  const firstCard = reopened.locator(`#control-card-${tunnelIds[0]}`);
  const qcDraft = firstCard.getByTestId(`control-option-${tunnelIds[0]}-color-verde`);
  await qcDraft.click();
  await expect(qcDraft).toContainText('✓');
  const firstPhoto = firstCard.locator('img[title="Ver foto"]');
  const firstPhotoSrc = await page.evaluate(id => fotoSrcCompleta(controlFotosData[id]), tunnelIds[0]);
  await firstPhoto.click();
  const enlargedPhoto = page.locator('#control-foto-ampliada-overlay');
  await expect(enlargedPhoto.locator('img')).toHaveAttribute('src', firstPhotoSrc);
  await enlargedPhoto.locator('button').click();
  await expect(enlargedPhoto).toBeHidden();
  await expect(firstCard).toBeVisible();
  await expect(qcDraft).toContainText('✓');
  await reopened.getByTestId('control-day-previous').click();
  await expect(reopened.locator(`#control-card-${previousDayId} img[title="Ver foto"]`)).toBeVisible();
  await reopened.getByTestId('control-day-next').click();
  await reopened.getByTestId('control-greenhouse-filter').selectOption('18');
  await expect(reopened.locator(`#control-card-${otherGreenhouseId} img[title="Ver foto"]`)).toBeVisible();
  await reopened.getByTestId('control-greenhouse-filter').selectOption('17');
  await expect(reopened.locator(`#control-card-${tunnelIds[0]} img[title="Ver foto"]`)).toBeVisible();
  await reopened.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(reopened.locator(`#control-card-${cargaId} img[title="Ver foto"]`)).toBeVisible();
  const ids = [...tunnelIds, cargaId];
  expect(await page.evaluate(idsToCheck => Object.fromEntries(idsToCheck.map(id => [id, !!controlFotosData[id]])), ids)).toEqual(Object.fromEntries(ids.map(id => [id, true])));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-383–384: rechazar archivos que no son imágenes y fotos dañadas sin cambiar la galería', async ({ page }) => {
  const database = fixtureDatabase();
  const id = 'e2e-control-current-fortnight';
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({});
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  database['lasala-control-fotos-v1'] = JSON.stringify({});
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator(`#control-card-${id}`);
  const upload = card.locator('input[data-testid^="control-photo-gallery-"]');
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(0);

  await upload.setInputFiles({ name: 'e2e-not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('no es una imagen') });
  await expect(page.locator('#app-toast')).toContainText('El archivo elegido no es una imagen');
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(0);
  await expect.poll(() => database['lasala-control-fotos-v1']).toBe('{}');

  await upload.setInputFiles({ name: 'e2e-corrupt-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('JPEG corrupto') });
  await expect(page.locator('#app-toast')).toContainText('No se ha podido leer esa foto');
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(0);
  await expect.poll(() => database['lasala-control-fotos-v1']).toBe('{}');
  expect(JSON.parse(database['lasala-control-fotos-indice-v1'])).toEqual({});
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-050 y UAT-401: cancelar conserva la foto; confirmar la elimina del shard e índice', async ({ page }) => {
  const database = fixtureDatabase();
  const id = 'e2e-control-current-fortnight';
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=';
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({ [id]: 'lasala-control-fotos-v1' });
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  database['lasala-control-fotos-v1'] = JSON.stringify({ [id]: { f: photo, t: photo } });
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator(`#control-card-${id}`);
  await expect(card.locator('img[title="Ver foto"]')).toBeVisible();
  const shardBeforeCancel = database['lasala-control-fotos-v1'];
  const indexBeforeCancel = database['lasala-control-fotos-indice-v1'];
  page.once('dialog', dialog => dialog.dismiss());
  await card.getByTestId(`control-photo-delete-${id}`).click();
  await expect(card.locator('img[title="Ver foto"]')).toBeVisible();
  expect(database['lasala-control-fotos-v1']).toBe(shardBeforeCancel);
  expect(database['lasala-control-fotos-indice-v1']).toBe(indexBeforeCancel);

  page.once('dialog', dialog => dialog.accept());
  await card.getByTestId(`control-photo-delete-${id}`).click();
  await expect(card.locator('img[title="Ver foto"]')).toHaveCount(0);
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-v1'])).not.toHaveProperty(id);
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-indice-v1'])).not.toHaveProperty(id);

  await page.reload();
  await page.getByTestId('home-control').click();
  const reloaded = page.locator('#control-overlay');
  await reloaded.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(reloaded.locator(`#control-card-${id} img[title="Ver foto"]`)).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-051: dos usuarios suben fotos a líneas distintas sin perder ninguna', async ({ page, context }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_ADMIN_2: 'ADMIN' });
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({});
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  database['lasala-control-fotos-v1'] = JSON.stringify({});
  const first = await startControlTest(page, database, login.user, 120);
  await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_CONTROL_ADMIN_2', ts: Date.now() })));
  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database, 120);
    const photos = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XxsAAAAASUVORK5CYII=', 'base64');
    const firstId = 'e2e-control-current-fortnight';
    const secondId = 'e2e-control-current-fortnight-second-line';
    await Promise.all([
      first.overlay.locator(`#control-card-${firstId} input[data-testid^="control-photo-gallery-"]`).setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: photos }),
      second.overlay.locator(`#control-card-${secondId} input[data-testid^="control-photo-gallery-"]`).setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: photos })
    ]);
    await expect.poll(() => {
      const shard = JSON.parse(database['lasala-control-fotos-v1']);
      return [!!shard[firstId], !!shard[secondId]];
    }).toEqual([true, true]);
    await expect.poll(() => {
      const index = JSON.parse(database['lasala-control-fotos-indice-v1']);
      return [index[firstId], index[secondId]];
    }).toEqual(['lasala-control-fotos-v1', 'lasala-control-fotos-v1']);
    const index = JSON.parse(database['lasala-control-fotos-indice-v1']);
    expect(index[firstId]).toBe('lasala-control-fotos-v1');
    expect(index[secondId]).toBe('lasala-control-fotos-v1');
    await expect(first.overlay.locator(`#control-card-${firstId} img[title="Ver foto"]`)).toBeVisible();
    await expect(second.overlay.locator(`#control-card-${secondId} img[title="Ver foto"]`)).toBeVisible();
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-052 y UAT-053: adjuntar un PDF a Control lo conserva después de recargar', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const pdf = Buffer.from('%PDF-1.4\n% fixture UAT PDF\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');
  const upload = overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]');
  await upload.setInputFiles({ name: 'e2e-control-30-jun.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-tunel-30'] || 'null')?.nombre).toBe('e2e-control-30-jun.pdf');
  await expect.poll(() => JSON.parse(database['lasala-control-pdfs-indice-v1'])).toContain('tunel|30');
  await expect(overlay).toContainText('e2e-control-30-jun.pdf');

  await page.reload();
  await page.getByTestId('home-control').click();
  const reopened = page.locator('#control-overlay');
  await reopened.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(reopened).toContainText('e2e-control-30-jun.pdf');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-054: los PDFs de días distintos se abren desde su fecha correspondiente', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const pdf = Buffer.from('%PDF-1.4\n% fixture PDF por día\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');
  const upload = day => overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')
    .setInputFiles({ name: `e2e-control-${day}.pdf`, mimeType: 'application/pdf', buffer: pdf });

  await upload(30);
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-tunel-30'] || 'null')?.nombre).toBe('e2e-control-30.pdf');
  await overlay.getByTestId('control-day-next').click();
  await upload(31);
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-tunel-31'] || 'null')?.nombre).toBe('e2e-control-31.pdf');
  await expect(overlay).toContainText('e2e-control-31.pdf');
  await overlay.getByTestId('control-day-previous').click();
  await expect(overlay).toContainText('e2e-control-30.pdf');
  await expect(overlay).not.toContainText('e2e-control-31.pdf');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-055: dos usuarios adjuntan PDFs a días distintos sin perder índices', async ({ page, context }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_ADMIN_2: 'ADMIN' });
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const first = await startControlTest(page, database, login.user, 120);
  await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_CONTROL_ADMIN_2', ts: Date.now() })));
  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database, 120);
    await second.overlay.getByTestId('control-day-next').click();
    const pdf = Buffer.from('%PDF-1.4\n% fixture concurrente\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');
    await Promise.all([
      first.overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')
        .setInputFiles({ name: 'e2e-concurrent-30.pdf', mimeType: 'application/pdf', buffer: pdf }),
      second.overlay.locator('[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]')
        .setInputFiles({ name: 'e2e-concurrent-31.pdf', mimeType: 'application/pdf', buffer: pdf })
    ]);
    await expect.poll(() => {
      const index = JSON.parse(database['lasala-control-pdfs-indice-v1']);
      return [index.includes('tunel|30'), index.includes('tunel|31')];
    }).toEqual([true, true]);
    expect(JSON.parse(database['lasala-control-pdf-v1-tunel-30']).nombre).toBe('e2e-concurrent-30.pdf');
    expect(JSON.parse(database['lasala-control-pdf-v1-tunel-31']).nombre).toBe('e2e-concurrent-31.pdf');
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-434, UAT-435, UAT-462 y UAT-467: cada PDF permanece en su módulo y Carga no genera efectos de Túnel', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-pdfs-indice-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await page.evaluate(() => {
    window.loadScriptOnce = async () => {};
    window.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument: () => ({ promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({ getTextContent: async () => ({ items: [] }) })
      }) })
    };
  });
  const pdf = Buffer.from('%PDF-1.4\n% fixture documentos QC\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');
  const uploadPdf = (section, name) => overlay.locator(`[data-testid="control-day-operations"] input[type="file"][accept="application/pdf"]`)
    .setInputFiles({ name, mimeType: 'application/pdf', buffer: pdf });

  await uploadPdf('tunel', 'e2e-tunel-original.pdf');
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-tunel-30'] || 'null')?.nombre).toBe('e2e-tunel-original.pdf');
  const tunnelLink = overlay.locator('[data-testid="control-day-operations"] a').filter({ hasText: 'Ver' });
  await expect(tunnelLink).toHaveAttribute('href', /^data:application\/pdf;base64,/);

  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const controlItemsBeforeCargaPdf = JSON.stringify(database['lasala-control-items-v1']);
  const workItemsBeforeCargaPdf = JSON.stringify(database['lasala-trabajos-v1']);
  await uploadPdf('carga', 'e2e-carga-original.pdf');
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-carga-30'] || 'null')?.nombre).toBe('e2e-carga-original.pdf');
  await expect.poll(() => JSON.parse(database['lasala-control-pdf-v1-carga_normal-30'] || 'null')?.nombre).toBe('e2e-carga-original.pdf');
  expect(JSON.stringify(database['lasala-control-items-v1'])).toBe(controlItemsBeforeCargaPdf);
  expect(JSON.stringify(database['lasala-trabajos-v1'])).toBe(workItemsBeforeCargaPdf);
  const cargaLink = overlay.locator('[data-testid="control-day-operations"] a').filter({ hasText: 'Ver' });
  await expect(cargaLink).toHaveAttribute('href', /^data:application\/pdf;base64,/);
  await expect(overlay).toContainText('e2e-carga-original.pdf');
  await expect(overlay).not.toContainText('e2e-tunel-original.pdf');

  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(overlay).toContainText('e2e-tunel-original.pdf');
  await expect(overlay).not.toContainText('e2e-carga-original.pdf');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-264–266, UAT-269–270, UAT-274–280: alta manual de Carga valida campos, ubicación y persistencia', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.getByTestId('control-add-line')).toHaveCount(1);
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  await expect(form.locator('#ncc-cliente')).toHaveCount(1);
  await expect(form.locator('#ncc-partida')).toHaveCount(1);
  await expect(form.locator('#ncc-variedad')).toHaveCount(1);
  await expect(form.locator('#ncc-bandejas')).toHaveCount(1);
  await expect(form.getByText(/wizard/i)).toHaveCount(0);
  await form.locator('#ncc-cliente').selectOption({ label: 'Fixture carga con formato de partida' });
  await form.locator('#ncc-variedad').selectOption({ label: 'CALABACÍN' });
  await form.locator('#ncc-partida').fill('26X00044');
  await form.locator('#ncc-bandejas').fill('999');
  await form.locator('#ncc-inv').selectOption('17');
  await form.locator('#ncc-calle-desde').selectOption('4');
  await form.locator('#ncc-calle-hasta').selectOption('4');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ya existe esa partida en la misma fecha y ubicación')).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).filter(item => item.partida === '26X00044')).toHaveLength(1);
  await form.getByRole('button', { name: 'Cancelar' }).click();

  const datePicker = overlay.getByTestId('control-date-picker');
  await datePicker.fill('2026-07-02');
  await datePicker.dispatchEvent('change');
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  await overlay.getByTestId('control-add-line').click();
  await expect(form.locator('#ncc-cliente')).toBeVisible();
  const partida = '26X99998';
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Indica el cliente')).toBeVisible();
  await form.locator('#ncc-cliente').selectOption({ label: 'Fixture carga' });
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Indica el número de partida')).toBeVisible();
  await form.locator('#ncc-partida').fill('PARTIDA-INVALIDA');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Formato de partida no válido (ej. 26X00322)')).toBeVisible();
  await form.locator('#ncc-partida').fill(partida);
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Indica la variedad')).toBeVisible();
  await form.locator('#ncc-variedad').selectOption({ label: 'CALABACÍN' });
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Indica un número entero positivo de bandejas')).toBeVisible();
  for (const invalid of ['0', '-2', '1.5']) {
    await form.locator('#ncc-bandejas').fill(invalid);
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Indica un número entero positivo de bandejas')).toBeVisible();
    expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === partida)).toBe(false);
  }
  await form.locator('#ncc-bandejas').fill('15');
  await form.locator('#ncc-inv').selectOption('17');
  await form.locator('#ncc-calle-desde').evaluate(select => {
    select.add(new Option('999', '999'));
    select.value = '999';
  });
  await form.locator('#ncc-calle-hasta').selectOption('4');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Selecciona un invernadero y calles válidas para esa ubicación')).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === partida)).toBe(false);
  await form.locator('#ncc-calle-desde').selectOption('8');
  await form.locator('#ncc-calle-hasta').selectOption('4');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('El tramo de calles está invertido; corrige desde/hasta')).toBeVisible();
  await form.locator('#ncc-calle-desde').selectOption('4');
  await form.locator('#ncc-calle-hasta').selectOption('8');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).find(item => item.partida === partida)?.dia).toBe(32);
  const created = Object.values(database['lasala-control-items-v1']).find(item => item.partida === partida);
  expect(created).toMatchObject({ tipo: 'carga', cliente: 'Fixture carga', variedad: 'CALABACÍN', numBandejas: '15', invernadero: '17-4-8', origen: 'manual' });

  await page.reload();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const search = overlay.locator('#control-buscar-partida');
  await search.fill(partida);
  await search.press('Enter');
  await expect(overlay.locator('#control-card-'+created.id)).toBeVisible();
  await expect(overlay.getByTestId('control-status-'+created.id)).toHaveText('Pendiente');
  expect(Object.values(database['lasala-control-items-v1']).filter(item => item.partida === partida)).toHaveLength(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-268: el guardado de Carga rechaza una ficha que quedó abierta al volver a una fecha pasada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  await form.locator('#ncc-cliente').selectOption({ label: 'Fixture carga' });
  await form.locator('#ncc-variedad').selectOption({ label: 'CALABACÍN' });
  await form.locator('#ncc-partida').fill('26X99997');
  await form.locator('#ncc-bandejas').fill('15');
  const guardado = await page.evaluate(() => {
    controlDiaSel = riegoDiaDeHoy() - 1;
    return guardarNuevoControlCargaCheck();
  });
  expect(guardado).toBe(false);
  await expect(page.getByText('No se pueden añadir líneas en una fecha pasada')).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === '26X99997')).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-271–273: el alta manual de Carga restringe Cliente y Variedad a parejas del catálogo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  const cliente = form.locator('#ncc-cliente');
  const variedad = form.locator('#ncc-variedad');
  await expect(cliente.locator('option')).toContainText(['— Cliente del catálogo —', 'CLIENTE CATÁLOGO B']);

  await cliente.selectOption({ label: 'CLIENTE CATÁLOGO B' });
  await expect(variedad.locator('option')).toHaveText(['— Variedad —', 'PEPINO']);
  await variedad.evaluate(select => {
    select.add(new Option('CALABACÍN', 'CALABACÍN'));
    select.value = 'CALABACÍN';
  });
  await form.locator('#ncc-partida').fill('26X99996');
  await form.locator('#ncc-bandejas').fill('12');
  await form.locator('#ncc-inv').selectOption('16');
  await form.locator('#ncc-calle-desde').selectOption('1');
  await form.locator('#ncc-calle-hasta').selectOption('1');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Selecciona una pareja Cliente/Variedad disponible en el catálogo')).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === '26X99996')).toBe(false);

  await variedad.selectOption({ label: 'PEPINO' });
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).find(item => item.partida === '26X99996')?.variedad).toBe('PEPINO');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-127: abrir Check Túnel desde Inicio y volver sin perder la sesión', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await expect(overlay.getByRole('button', { name: 'Check Túnel' })).toBeVisible();
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('home-control')).toBeVisible();

  await page.getByTestId('home-control').click();
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Check Túnel' })).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-020: marcar un check en Control lo guarda y lo conserva al volver a entrar', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');
  const verde = card.getByTestId('control-option-e2e-control-current-fortnight-color-verde');

  await verde.click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);
  await expect(verde).toContainText('✓');

  await page.reload();
  const reloadedOverlay = await openControlTunnel(page);
  const reloadedCard = reloadedOverlay.locator('#control-card-e2e-control-current-fortnight');
  await expect(reloadedCard.getByTestId('control-option-e2e-control-current-fortnight-color-verde')).toContainText('✓');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-026: dos sesiones guardan líneas QC distintas sin pisar sus cambios', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await startControlTest(page, database);
  const secondPage = await context.newPage();
  const second = await startControlSecondaryTest(secondPage, database);

  await first.overlay.getByTestId('control-option-e2e-control-current-fortnight-color-verde').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);
  await second.overlay.getByTestId('control-option-e2e-control-current-fortnight-second-line-tamano-grande').click();

  const items = database['lasala-control-items-v1'];
  expect(items['e2e-control-current-fortnight'].color?.verde).toBe(true);
  expect(items['e2e-control-current-fortnight-second-line'].tamano?.grande).toBe(true);
  await expect(secondPage.locator('#aviso-fallo-guardado')).toHaveCount(0);
  expect(first.unexpectedHosts).toEqual([]);
  expect(second.unexpectedHosts).toEqual([]);
});

test('UAT-062: al recargar, una sesión ve el cambio reciente de otro usuario y conserva el suyo', async ({ page, context }) => {
  const database = withControlRoles(fixtureDatabase(), { E2E_CONTROL_ADMIN_2: 'ADMIN' });
  const first = await startControlTest(page, database, login.user);
  await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_CONTROL_ADMIN_2', ts: Date.now() })));
  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database);
    await first.overlay.getByTestId('control-option-e2e-control-current-fortnight-color-verde').click();
    await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);
    await second.overlay.getByTestId('control-option-e2e-control-current-fortnight-second-line-tamano-grande').click();
    await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight-second-line'].tamano?.grande).toBe(true);

    await page.evaluate(user => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user, ts: Date.now() })), login.user);
    await page.reload();
    await expect(page.locator('#app')).toBeVisible();
    await page.getByTestId('home-control').click();
    const reloaded = page.locator('#control-overlay');
    await reloaded.getByRole('button', { name: 'Check Túnel' }).click();
    await expect(reloaded.getByTestId('control-option-e2e-control-current-fortnight-color-verde')).toContainText('✓');
    await expect(reloaded.getByTestId('control-option-e2e-control-current-fortnight-second-line-tamano-grande')).toContainText('✓');
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-027, UAT-218 y UAT-2421: edición concurrente QC rechazada por ETag conserva el cambio local hasta resolver', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await startControlTest(page, database);
  const secondPage = await context.newPage();
  const second = await startControlSecondaryTest(secondPage, database);

  // Ambas sesiones ya cargaron la misma versión. La primera guarda y la
  // segunda intenta guardar sobre su ETag obsoleto.
  await first.overlay.getByTestId('control-option-e2e-control-current-fortnight-color-verde').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);
  await secondPage.evaluate(() => aplicarControlCheckOpcion('e2e-control-current-fortnight', 'tamano', 'grande', true));

  const saved = database['lasala-control-items-v1']['e2e-control-current-fortnight'];
  expect(saved.color?.verde).toBe(true);
  expect(saved.tamano?.grande).not.toBe(true);
  await expect(secondPage.locator('#aviso-fallo-guardado')).toContainText('Otra persona guardó cambios');
  await expect(secondPage.getByTestId('control-option-e2e-control-current-fortnight-tamano-grande')).toContainText('✓');
  expect(first.unexpectedHosts).toEqual([]);
  expect(second.unexpectedHosts).toEqual([]);
});

test('UAT-338: QC Carga avisa ante dos ediciones concurrentes de una inspección y conserva la primera', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await startControlTest(page, database);
  const card = await createNewCargaV6Line(first.overlay, '26X09338');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database);
    await second.overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
    const secondCard = second.overlay.locator(`#control-card-${id}`);
    await expect(secondCard).toBeVisible();

    for (const category of ['color', 'tamano', 'flores', 'raices']) {
      await card.getByTestId(`qc-v6-${id}-${category}-ok`).click();
    }
    await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
    await card.getByTestId(`qc-v6-${id}-save`).click();
    await expect.poll(() => database['lasala-control-items-v1'][id].qcV6.color).toBe('ok');
    const savedBeforeConflict = structuredClone(database['lasala-control-items-v1'][id]);

    for (const category of ['color', 'flores', 'raices']) {
      await secondCard.getByTestId(`qc-v6-${id}-${category}-ok`).click();
    }
    await secondCard.getByTestId(`qc-v6-${id}-tamano-grande`).click();
    await secondCard.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
    await secondCard.getByTestId(`qc-v6-${id}-save`).click();
    await expect(secondPage.locator('#aviso-fallo-guardado')).toContainText('Otra persona guardó cambios');
    expect(database['lasala-control-items-v1'][id]).toEqual(savedBeforeConflict);
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-339: guardar QC Carga y Túnel desde dos sesiones conserva cada inspección en su propio tipo e ID', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await startControlTest(page, database);
  const cargaCard = await createNewCargaV6Line(first.overlay, '26X09339');
  const cargaId = (await cargaCard.getAttribute('id')).replace('control-card-', '');
  await first.overlay.getByRole('button', { name: 'Check Túnel' }).click();
  const tunnelId = 'e2e-control-current-fortnight';
  const tunnelCard = first.overlay.locator(`#control-card-${tunnelId}`);
  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database);
    await second.overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
    const secondCargaCard = second.overlay.locator(`#control-card-${cargaId}`);
    await expect(secondCargaCard).toBeVisible();

    for (const category of ['color', 'tamano', 'flores', 'raices']) {
      await secondCargaCard.getByTestId(`qc-v6-${cargaId}-${category}-ok`).click();
    }
    await secondCargaCard.getByTestId(`qc-v6-${cargaId}-sanidad-ok`).click();
    await Promise.all([
      tunnelCard.getByTestId(`control-option-${tunnelId}-color-verde`).click(),
      secondCargaCard.getByTestId(`qc-v6-${cargaId}-save`).click()
    ]);

    await expect.poll(() => database['lasala-control-items-v1'][tunnelId].color?.verde).toBe(true);
    await expect.poll(() => database['lasala-control-items-v1'][cargaId].qcV6?.color).toBe('ok');
    expect(database['lasala-control-items-v1'][tunnelId].tipo).toBe('tunel');
    expect(database['lasala-control-items-v1'][cargaId].tipo).toBe('carga');
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-021: guardar una observación de Control y conservarla al recargar', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const note = 'Observación E2E: inspección correcta';
  const observation = overlay.getByTestId('control-observations-e2e-control-current-fortnight');

  await observation.fill(note);
  await observation.press('Tab');
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].observaciones).toBe(note);

  await page.reload();
  const reloadedOverlay = await openControlTunnel(page);
  await expect(reloadedOverlay.getByTestId('control-observations-e2e-control-current-fortnight')).toHaveValue(note);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-019: Control carga las líneas de Túnel y Carga del periodo seleccionado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(overlay.getByText('E2E-CARGA-QUINCENA-ACTUAL', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-159–161: alta de Túnel ofrece pares del catálogo importado y rechaza combinaciones ajenas', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1']['e2e-control-pdf-catalog'] = {
    id: 'e2e-control-pdf-catalog', tipo: 'tunel', origen: 'pdf', dia: 30,
    partida: '26X00040', clienteVariedad: 'CLIENTE CATÁLOGO — TOMATE',
    numBandejas: 20, invId: '17', calleDesde: 1701, calleHasta: 1701
  };
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await overlay.getByTestId('control-add-line').click();
  let form = overlay.locator('#nuevo-control-form-wrap');
  const catalogo = form.locator('#nc-cliente-variedad');
  await expect(catalogo).toHaveJSProperty('tagName', 'SELECT');
  await expect(catalogo.locator('option')).toContainText(['— Cliente y variedad del catálogo —', 'CLIENTE CATÁLOGO — TOMATE']);
  await expect(form.locator('input#nc-cliente-variedad')).toHaveCount(0);

  await catalogo.selectOption({ label: 'CLIENTE CATÁLOGO — TOMATE' });
  await form.locator('#nc-partida').fill('26X99990');
  await form.locator('#nc-bandejas').fill('12');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).find(item => item.partida === '26X99990')?.clienteVariedad).toBe('CLIENTE CATÁLOGO — TOMATE');

  await overlay.getByTestId('control-add-line').click();
  form = overlay.locator('#nuevo-control-form-wrap');
  await form.locator('#nc-cliente-variedad').evaluate(select => {
    select.add(new Option('CLIENTE CATÁLOGO — VARIEDAD NO AUTORIZADA', 'CLIENTE CATÁLOGO — VARIEDAD NO AUTORIZADA'));
    select.value = 'CLIENTE CATÁLOGO — VARIEDAD NO AUTORIZADA';
  });
  await form.locator('#nc-partida').fill('26X99989');
  await form.locator('#nc-bandejas').fill('12');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#app-toast')).toContainText('disponible en el catálogo');
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === '26X99989')).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-172: editar Túnel usa parejas controladas y bloquea una combinación ajena al catálogo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const id = 'e2e-control-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);

  await card.getByTestId(`control-edit-${id}`).click();
  let editor = page.locator('#control-editar-overlay');
  const pareja = editor.locator('#ec-cliente-variedad');
  await expect(pareja).toHaveJSProperty('tagName', 'SELECT');
  await pareja.selectOption({ label: 'Fixture independiente del mismo día' });
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => database['lasala-control-items-v1'][id].clienteVariedad).toBe('Fixture independiente del mismo día');

  await overlay.locator(`#control-card-${id}`).getByTestId(`control-edit-${id}`).click();
  editor = page.locator('#control-editar-overlay');
  await editor.locator('#ec-cliente-variedad').evaluate(select => {
    select.add(new Option('CLIENTE AJENO — VARIEDAD AJENA', 'CLIENTE AJENO — VARIEDAD AJENA'));
    select.value = 'CLIENTE AJENO — VARIEDAD AJENA';
  });
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#app-toast')).toContainText('disponible en el catálogo');
  expect(database['lasala-control-items-v1'][id].clienteVariedad).toBe('Fixture independiente del mismo día');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-022: crear una línea de Control la muestra y la guarda', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await overlay.getByTestId('control-add-line').click();
  await page.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await page.locator('#nc-partida').fill('26X99991');
  await page.locator('#nc-bandejas').fill('24');
  await overlay.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText('26X99991', { exact: true })).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item => item.partida === '26X99991')).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-023: editar una línea de Control solo cambia la línea seleccionada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const id = 'e2e-control-current-fortnight';
  const original = structuredClone(database['lasala-control-items-v1'][id]);
  const card = overlay.locator(`#control-card-${id}`);

  await card.getByTestId(`control-edit-${id}`).click();
  const editOverlay = page.locator('#control-editar-overlay');
  await page.locator('#ec-partida').fill('E2E-CONTROL-EDITADA');
  await editOverlay.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText('E2E-CONTROL-EDITADA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-OTRA-LINEA', { exact: true })).toBeVisible();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].partida).toBe('E2E-CONTROL-EDITADA');
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight-second-line'].partida).toBe('E2E-QUINCENA-ACTUAL-OTRA-LINEA');
  expect(database['lasala-control-items-v1'][id].invId).toBe(original.invId);
  expect(database['lasala-control-items-v1'][id].calleDesde).toBe(original.calleDesde);
  expect(database['lasala-control-items-v1'][id].calleHasta).toBe(original.calleHasta);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-176: mover una línea de QC a mañana conserva los demás datos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');
  await card.getByTestId('control-edit-e2e-control-current-fortnight').click();
  const editor = page.locator('#control-editar-overlay');
  await editor.locator('#ec-dia').selectOption('31');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].dia).toBe(31);
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].partida).toBe('E2E-QUINCENA-ACTUAL-DIA-30');
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].invId).toBe('17');
  await overlay.getByRole('button', { name: /^1 jul/ }).click();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-175: editar un dato de una línea conserva todos sus tramos de invernadero', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const id = 'e2e-control-current-fortnight-multi-segment';
  const original = structuredClone(database['lasala-control-items-v1'][id]);
  const card = overlay.locator(`#control-card-${id}`);

  await card.getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-overlay');
  await editor.locator('#ec-partida').fill('E2E-TRAMOS-PRESERVADOS');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect.poll(() => database['lasala-control-items-v1'][id].partida).toBe('E2E-TRAMOS-PRESERVADOS');
  expect(database['lasala-control-items-v1'][id].invId).toBe(original.invId);
  expect(database['lasala-control-items-v1'][id].tramos).toEqual(original.tramos);
  expect(database['lasala-control-items-v1'][id].calleDesde).toBe(original.calleDesde);
  expect(database['lasala-control-items-v1'][id].calleHasta).toBe(original.calleHasta);

  await page.reload();
  const reopened = await openControlTunnel(page);
  const reopenedCard = reopened.locator(`#control-card-${id}`);
  await expect(reopenedCard).toContainText('E2E-TRAMOS-PRESERVADOS');
  await expect(reopenedCard).toContainText('INV 17 — C/1701-1703, C/1708-1709');
  expect(database['lasala-control-items-v1'][id].tramos).toEqual(original.tramos);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-171 y UAT-173: Editar partida abre con la ubicación y permite cambiar INV/calles conservándolos al reabrir', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const id = 'e2e-control-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);

  await card.getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-overlay');
  await expect(editor.locator('#ec-partida')).toHaveValue('E2E-QUINCENA-ACTUAL-DIA-30');
  await expect(editor.locator('#ec-cliente-variedad')).toHaveValue('Fixture quincena actual');
  await expect(editor.locator('#ec-inv')).toHaveValue('17');
  await expect(editor.locator('#ec-calle-desde')).toHaveValue('1702');
  await expect(editor.locator('#ec-calle-hasta')).toHaveValue('1702');
  await editor.locator('#ec-inv').selectOption('18');
  const calle = await editor.locator('#ec-calle-desde option').nth(0).getAttribute('value');
  await editor.locator('#ec-calle-desde').selectOption(calle);
  await editor.locator('#ec-calle-hasta').selectOption(calle);
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect.poll(() => database['lasala-control-items-v1'][id].invId).toBe('18');
  await expect.poll(() => database['lasala-control-items-v1'][id].calleDesde).toBe(Number(calle));
  expect(database['lasala-control-items-v1'][id].calleHasta).toBe(Number(calle));
  expect(database['lasala-control-items-v1'][id].tramos).toEqual([{desde:Number(calle),hasta:Number(calle)}]);

  await page.reload();
  const reopened = await openControlTunnel(page);
  const reopenedCard = reopened.locator(`#control-card-${id}`);
  await expect(reopenedCard).toContainText(`INV 18 — C/${calle}`);
  await reopenedCard.getByTestId(`control-edit-${id}`).click();
  const reopenedEditor = page.locator('#control-editar-overlay');
  await expect(reopenedEditor.locator('#ec-inv')).toHaveValue('18');
  await expect(reopenedEditor.locator('#ec-calle-desde')).toHaveValue(calle);
  await expect(reopenedEditor.locator('#ec-calle-hasta')).toHaveValue(calle);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-174: Editar partida rechaza calles ajenas al INV y ubicaciones duplicadas', async ({ page }) => {
  const database = fixtureDatabase();
  const duplicateId = 'e2e-control-duplicate-location';
  database['lasala-control-items-v1'][duplicateId] = {
    id: duplicateId, tipo:'tunel', dia:30, partida:'E2E-QUINCENA-ACTUAL-DIA-30',
    clienteVariedad:'Fixture duplicado', invId:'17', calleDesde:1, calleHasta:1,
    numBandejas:5
  };
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const id = 'e2e-control-current-fortnight';
  const card = overlay.locator(`#control-card-${id}`);
  const original = structuredClone(database['lasala-control-items-v1'][id]);
  const writes = [];
  page.on('request', request => {
    if (firebaseUrl.test(request.url()) && ['PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.url());
  });

  await card.getByTestId(`control-edit-${id}`).click();
  const editor = page.locator('#control-editar-overlay');
  await editor.locator('#ec-calle-desde').evaluate(select => {
    select.add(new Option('9999','9999'));
    select.value='9999';
  });
  await editor.locator('#ec-calle-hasta').evaluate(select => {
    select.add(new Option('9999','9999'));
    select.value='9999';
  });
  const beforeInvalid = writes.length;
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#app-toast')).toContainText('no pertenece al invernadero');
  await expect(editor).toBeVisible();
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toHaveLength(beforeInvalid);

  await editor.locator('#ec-calle-desde').selectOption('1');
  await editor.locator('#ec-calle-hasta').selectOption('1');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.locator('#app-toast')).toContainText('Ya existe esa partida en la misma fecha y ubicación');
  await expect(editor).toBeVisible();
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toHaveLength(beforeInvalid);
  expect(Object.values(database['lasala-control-items-v1']).filter(item => item.partida === original.partida)).toHaveLength(2);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-177: bloquear el traslado de una línea histórica a otro día pasado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: /^29 jun/ }).click();
  const card = overlay.locator('#control-card-e2e-control-current-fortnight-first-day');
  await card.getByTestId('control-edit-e2e-control-current-fortnight-first-day').click();
  const editor = page.locator('#control-editar-overlay');
  await editor.locator('#ec-dia').selectOption('28');
  await editor.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.locator('#app-toast')).toContainText('No se puede mover una línea a una fecha pasada');
  await expect(editor).toBeVisible();
  expect(database['lasala-control-items-v1']['e2e-control-current-fortnight-first-day'].dia).toBe(29);
  expect(database['lasala-control-items-v1']['e2e-control-current-fortnight-first-day'].partida).toBe('E2E-QUINCENA-ACTUAL-DIA-29');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-024, UAT-179 y UAT-180: acciones accesibles y borrado cancelable o confirmado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');
  const edit = card.getByRole('button', { name: 'Editar partida' });
  const remove = card.getByRole('button', { name: 'Eliminar línea' });
  await expect(edit).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(edit).toHaveCSS('min-height', '36px');
  await expect(remove).toHaveAttribute('style', /#fdecea/);

  let cancelMessage = '';
  page.once('dialog', async dialog => {
    cancelMessage = dialog.message();
    await dialog.dismiss();
  });
  await remove.click();
  expect(cancelMessage).toContain('Fixture quincena actual');
  await expect(card).toBeVisible();
  expect(database['lasala-control-items-v1']['e2e-control-current-fortnight']).toBeTruthy();

  let confirmMessage = '';
  page.once('dialog', async dialog => {
    confirmMessage = dialog.message();
    await dialog.accept();
  });
  await remove.click();
  expect(confirmMessage).toContain('Fixture quincena actual');
  await expect(card).toHaveCount(0);
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight']).toBeUndefined();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-008: Control conserva sus acciones principales en ventana de PC', async ({ page }) => {
  await expectControlUsableAtViewport(page, { width: 1280, height: 800 });
});

test('UAT-009: Control conserva sus acciones principales en viewport móvil', async ({ page }) => {
  await expectControlUsableAtViewport(page, { width: 390, height: 844 });
});

test('UAT-010: Control conserva sus acciones principales en viewport de tablet', async ({ page }) => {
  await expectControlUsableAtViewport(page, { width: 768, height: 1024 });
});

test('UAT-138: Check Túnel conserva fecha y acciones en móvil horizontal', async ({ page }) => {
  await expectControlUsableAtViewport(page, { width: 844, height: 390 });
});

test('UAT-230: QC Túnel conserva calendario, filtros, tarjetas y evaluación en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await expect(overlay.getByTestId('control-date-picker')).toBeVisible();
  await expect(overlay.getByTestId('control-day-previous')).toBeVisible();
  await expect(overlay.getByTestId('control-day-next')).toBeVisible();
  await expect(overlay.getByTestId('control-inspections')).toBeVisible();
  await expect(overlay.locator('#control-card-e2e-control-current-fortnight')).toBeVisible();
  const dimensions = await overlay.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-139, UAT-140, UAT-141, UAT-142 y UAT-144: el filtro de INV funciona con datos y días vacíos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const select = overlay.locator('#control-content-wrap select').first();

  await expect(select.locator('option').first()).toHaveText('Todos los invernaderos');
  await expect(select.locator('optgroup')).toHaveCount(5);
  for (const label of ['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']) {
    await expect(select.locator(`optgroup[label="${label}"]`)).toHaveCount(1);
  }
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toBeVisible();
  await select.selectOption('17');
  await expect(select).toHaveValue('17');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toHaveCount(0);
  await select.selectOption('18');
  await expect(select).toHaveValue('18');
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);

  await select.selectOption('');
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toBeVisible();

  await overlay.getByTestId('control-quincena-previous').click();
  await overlay.locator('button[onclick="cambiarControlDia(20)"]').click();
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  await expect(overlay.locator('#control-content-wrap select')).toHaveCount(1);
  await expect(overlay.locator('#control-content-wrap select')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-133, UAT-134, UAT-155 y UAT-156: consultar fechas pasadas sin permitir altas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByTestId('control-quincena-previous').click();
  await overlay.locator('button[onclick="cambiarControlDia(15)"]').click();
  await expect(overlay.getByText('E2E-QUINCENA-ANTERIOR', { exact: true })).toBeVisible();
  await expect(overlay.getByTestId('control-add-line')).toHaveCount(0);

  await overlay.locator('button[onclick="cambiarControlDia(20)"]').click();
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  await expect(overlay.getByTestId('control-add-line')).toHaveCount(0);

  await page.evaluate(() => mostrarFormNuevoControlCheck('tunel'));
  await page.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await page.locator('#nc-partida').fill('E2E-QC-ALTA-RETROACTIVA');
  await page.locator('#nc-bandejas').fill('10');
  await overlay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('No se pueden añadir líneas en una fecha pasada')).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item =>
    item.partida === 'E2E-QC-ALTA-RETROACTIVA'
  )).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-148 y UAT-149: buscar una partida existente o inexistente sin perder el estado de Control', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const search = overlay.locator('#control-buscar-partida');

  await search.fill('E2E-QUINCENA-ACTUAL-DIA-30');
  await overlay.getByTitle('Buscar').click();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByTestId('control-quincena-label')).toContainText('Quincena 2');

  await overlay.locator('#control-buscar-partida').fill('E2E-NO-EXISTE');
  await overlay.getByTitle('Buscar').click();
  await expect(page.getByText('No se ha encontrado ninguna línea con esa partida')).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-153 y UAT-157: abrir un único alta y añadir una partida manual de prueba', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const partida = '26X99992';

  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap > div');
  await expect(form).toHaveCount(1);
  await expect(form.locator('#nc-partida')).toBeVisible();
  await overlay.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await overlay.locator('#nc-partida').fill(partida);
  await overlay.locator('#nc-bandejas').fill('24');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText(partida, { exact: true })).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item =>
    item.partida === partida && item.tipo === 'tunel' && item.dia === 30
  )).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-143: cambiar de día conserva el invernadero seleccionado y actualiza las líneas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const select = overlay.locator('#control-content-wrap select').first();

  await select.selectOption('17');
  await overlay.getByRole('button', { name: /^29 jun/ }).click();

  await expect(select).toHaveValue('17');
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-29', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-154: el alta futura se guarda en el día seleccionado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: /^1 jul/ }).click();
  await overlay.getByTestId('control-add-line').click();

  const form = overlay.locator('#nuevo-control-form-wrap > div');
  await form.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await form.locator('#nc-partida').fill('26X99993');
  await form.locator('#nc-bandejas').fill('12');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText('26X99993', { exact: true })).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item =>
    item.partida === '26X99993' && item.tipo === 'tunel' && item.dia === 31
  )).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-158: rechazar un número de partida con formato inválido', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByTestId('control-add-line').click();
  await overlay.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await overlay.locator('#nc-partida').fill('PARTIDA-MAL-FORMADA');
  await overlay.locator('#nc-bandejas').fill('12');
  await overlay.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.locator('#app-toast')).toContainText('Formato de partida no válido');
  await expect(overlay.locator('#nc-partida')).toBeVisible();
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === 'PARTIDA-MAL-FORMADA')).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-162 y UAT-163: exigir los campos de alta y bandejas enteras positivas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByTestId('control-add-line').click();
  const before = Object.keys(database['lasala-control-items-v1']).length;
  const form = overlay.locator('#nuevo-control-form-wrap');
  const save = form.getByRole('button', { name: 'Guardar', exact: true });

  await form.locator('#nc-partida').fill('26X99994');
  await form.locator('#nc-bandejas').fill('12');
  await save.click();
  await expect(page.locator('#app-toast')).toContainText('Indica el cliente y variedad');
  expect(Object.keys(database['lasala-control-items-v1'])).toHaveLength(before);

  await form.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await form.locator('#nc-partida').fill('');
  await save.click();
  await expect(page.locator('#app-toast')).toContainText('Indica el número de partida');
  expect(Object.keys(database['lasala-control-items-v1'])).toHaveLength(before);

  await form.locator('#nc-partida').fill('26X99994');
  for (const value of ['0', '-1', '1.5', '']) {
    await form.locator('#nc-bandejas').fill(value);
    await save.click();
    await expect(page.locator('#app-toast')).toContainText('entero positivo de bandejas');
    expect(Object.keys(database['lasala-control-items-v1'])).toHaveLength(before);
  }
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-165: impedir duplicar una partida en fecha, tipo QC y ubicación aunque cambien las bandejas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const partida = '26X99995';
  const addLine = async (bandejas) => {
    await overlay.getByTestId('control-add-line').click();
    const form = overlay.locator('#nuevo-control-form-wrap');
    await form.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
    await form.locator('#nc-partida').fill(partida);
    await form.locator('#nc-bandejas').fill(String(bandejas));
    await form.locator('#nc-inv').selectOption('17');
    const desde = form.locator('#nc-calle-desde');
    const primeraCalle = await desde.locator('option').nth(0).getAttribute('value');
    await desde.selectOption(primeraCalle);
    await form.locator('#nc-calle-hasta').selectOption(primeraCalle);
    await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  };

  await addLine(24);
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).filter(item => item.partida === partida)).toHaveLength(1);
  const beforeRetry = Object.keys(database['lasala-control-items-v1']).length;
  await addLine(48);

  await expect(page.locator('#app-toast')).toContainText('Ya existe esa partida');
  await expect.poll(() => Object.keys(database['lasala-control-items-v1'])).toHaveLength(beforeRetry);
  expect(Object.values(database['lasala-control-items-v1']).filter(item => item.partida === partida)).toHaveLength(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-164: validar que las calles seleccionadas pertenecen al invernadero', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap');
  await form.locator('#nc-cliente-variedad').selectOption({ label: 'Fixture quincena actual' });
  await form.locator('#nc-partida').fill('26X99996');
  await form.locator('#nc-bandejas').fill('16');
  await form.locator('#nc-inv').selectOption('17');

  const calles = form.locator('#nc-calle-desde');
  expect(await calles.locator('option').allTextContents()).not.toContain('9999');
  await calles.evaluate(select => {
    select.add(new Option('9999', '9999'));
    select.value = '9999';
  });
  const before = Object.keys(database['lasala-control-items-v1']).length;
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.locator('#app-toast')).toContainText('no pertenece al invernadero');
  expect(Object.keys(database['lasala-control-items-v1'])).toHaveLength(before);
  expect(Object.values(database['lasala-control-items-v1']).some(item => item.partida === '26X99996')).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-150, UAT-151 y UAT-168: la tarjeta identifica coherentemente partida, variedad y ubicación', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const inspected = overlay.locator('#control-card-e2e-control-current-fortnight-completed');
  const pending = overlay.locator('#control-card-e2e-control-current-fortnight-multi-segment');

  await expect(inspected.getByTestId('control-status-e2e-control-current-fortnight-completed')).toHaveText('Inspeccionado');
  await expect(pending.getByTestId('control-status-e2e-control-current-fortnight-multi-segment')).toHaveText('Pendiente');
  const text = await inspected.innerText();
  const order = [
    text.indexOf('E2E-QUINCENA-COMPLETADA'),
    text.indexOf('Inspeccionado'),
    text.indexOf('Fixture inspección completada'),
    text.indexOf('Bandejas declaradas: 9'),
    text.indexOf('Calle real: INV 17')
  ];
  expect(order.every(index => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-145, UAT-146 y UAT-147: estado y contadores respetan el INV y la vista activa', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.locator('#control-content-wrap select').first().selectOption('17');

  await expect(overlay.getByRole('button', { name: 'Todos (4)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '✓ Completados (1)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '○ Pendientes (3)' })).toBeVisible();
  await overlay.getByRole('button', { name: '✓ Completados (1)' }).click();
  await expect(overlay.getByText('E2E-QUINCENA-COMPLETADA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await overlay.getByRole('button', { name: '○ Pendientes (3)' }).click();
  await expect(overlay.getByText('E2E-QUINCENA-COMPLETADA', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-OTRA-LINEA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toHaveCount(0);

  await expect(overlay.getByTestId('control-inspections')).toBeVisible();
  await expect(overlay.getByRole('button', { name: /Dashboard del día/ })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-182–185: sin opción «No evaluada» y selección exclusiva en Color, Tamaño y Raíces', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');
  await expect(card.getByText('No evaluada', { exact: true })).toHaveCount(0);

  await card.getByTestId('control-option-e2e-control-current-fortnight-color-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-color-verde').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.ok).toBe(false);

  await card.getByTestId('control-option-e2e-control-current-fortnight-tamano-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].tamano?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-tamano-grande').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].tamano?.grande).toBe(true);
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].tamano?.ok).toBe(false);

  await card.getByTestId('control-option-e2e-control-current-fortnight-raices-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].raices?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-raices-raizVieja').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].raices?.raizVieja).toBe(true);
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].raices?.ok).toBe(false);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-181 y UAT-186–209: QC v6 calcula, valida, guarda y recupera la evaluación porcentual', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const writes = [];
  page.on('request', request => {
    if (firebaseUrl.test(request.url()) && ['PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url());
  });
  const card = await createNewTunnelLine(overlay, '26X99996');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  await expect(card.getByTestId(`control-status-${id}`)).toHaveText('Pendiente');
  await expect(card.getByTestId(`qc-v6-${id}-save`)).toHaveCount(1);
  const writesBeforeInvalidSave = writes.length;
  await card.getByTestId(`qc-v6-${id}-save`).click();
  await expect(page.locator('#app-toast')).toContainText('Selecciona una opción válida');
  await expect.poll(() => writes.length).toBe(writesBeforeInvalidSave);

  for (const [category, option] of [['color','ok'],['tamano','ok'],['flores','ok'],['raices','ok']]) {
    await card.getByTestId(`qc-v6-${id}-${category}-${option}`).click();
  }
  await expect(card.getByTestId(`qc-v6-block-sanidad`)).toBeVisible();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toBeDisabled();
  await expect(card).not.toContainText('Bandejas inspeccionadas');
  for (const category of ['color','tamano','flores','raices']) {
    await expect(card.getByTestId(`qc-v6-block-${category}`).locator('select')).toHaveCount(0);
  }
  await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  const save = card.getByTestId(`qc-v6-${id}-save`);
  await save.click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.version).toBe(6);
  expect(database['lasala-control-items-v1'][id].qcV6.global).toBe(0);
  const writesAfterFirstSave = writes.length;
  await card.getByTestId(`qc-v6-${id}-save`).click();
  await expect.poll(() => writes.length).toBe(writesAfterFirstSave);

  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-color-ok`).click();
  await card.getByTestId(`qc-v6-${id}-flores-con_flores`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-flores-ok`).click();

  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('20');
  await expect(card.getByTestId(`qc-v6-${id}-percent-alternaria`)).toHaveValue('10');
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-alternaria`)).toHaveCount(0);
  await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveCount(0);
  await expect(card.getByTestId('qc-v6-block-sanidad')).toContainText('Seleccionado: OK');
  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();

  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('30');
  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  await card.getByTestId(`qc-v6-${id}-tamano-grande`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('40');
  await card.getByTestId(`qc-v6-${id}-flores-con_flores`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('60');
  await card.getByTestId(`qc-v6-${id}-flores-ok`).click();
  await card.getByTestId(`qc-v6-${id}-tamano-ok`).click();
  await card.getByTestId(`qc-v6-${id}-color-ok`).click();

  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveCount(0);
  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('100');
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await expect(page.locator('#app-toast')).toContainText('no puede superar el 100 %');
  await expect(card.getByTestId(`qc-v6-${id}-percent-alternaria`)).toHaveCount(0);
  await page.evaluate(id => actualizarControlQcV6EnfermedadPorcentaje(id, 'mildiu', 110), id);
  await expect(page.locator('#app-toast')).toContainText('múltiplo de 10');
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('100');

  await card.getByTestId(`qc-v6-${id}-global`).selectOption('70');
  await card.getByTestId(`qc-v6-${id}-save`).click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.global).toBe(70);
  await expect(card.getByTestId(`control-status-${id}`)).toHaveText('Completo');
  await expect(card).toBeVisible();
  const writesAfterManualSave = writes.length;
  await card.getByTestId(`qc-v6-${id}-save`).click();
  await expect.poll(() => writes.length).toBe(writesAfterManualSave);

  await page.evaluate(() => localStorage.clear());
  const freshSession = await page.context().newPage();
  await interceptFirebase(freshSession, database);
  await freshSession.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await freshSession.goto('/');
  const reopened = await openControlTunnel(freshSession, true);
  const reopenedCard = reopened.locator(`#control-card-${id}`);
  await expect(reopenedCard.getByTestId(`qc-v6-${id}-global`)).toHaveValue('70');
  await expect(reopenedCard.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('100');
  await expect(reopenedCard.getByTestId(`qc-v6-${id}-global-summary`)).toContainText('Mildiu 100 %');
  expect(database['lasala-control-items-v1'][id].qcV6.version).toBe(6);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-330–334: QC Carga mantiene legibles los registros heredados hasta que se editan expresamente', async ({ page }) => {
  const database = fixtureDatabase();
  const items = database['lasala-control-items-v1'];
  const legacy = {
    id: 'e2e-control-carga-legacy-v5', tipo: 'carga', dia: 29,
    cliente: 'Fixture carga histórica', partida: 'E2E-CARGA-HISTORICA', variedad: 'PEPINO',
    numBandejas: '8', invernadero: '17-4-4',
    color: {ok:false, verde:true, noEvaluada:true},
    tamano: {grande:true, pequeno:true},
    sanidad: {enferma:true},
    enfermedades: {mildiu:true, alternaria:true},
    flores: {no:true}, raices: {pocaRaiz:true}
  };
  items[legacy.id] = structuredClone(legacy);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const writes = [];
  page.on('request', request => {
    if (firebaseUrl.test(request.url()) && ['PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.url());
  });
  await overlay.getByTestId('control-day-previous').click();
  const card = overlay.locator(`#control-card-${legacy.id}`);
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('data-testid', `qc-v6-card-${legacy.id}`);
  await expect(card.getByTestId(`control-option-${legacy.id}-color-ok`)).not.toContainText('✓');
  await expect(card.getByTestId(`control-option-${legacy.id}-enfermedades-mildiu`)).toContainText('✓');
  await expect(card.getByTestId(`control-option-${legacy.id}-enfermedades-alternaria`)).toContainText('✓');
  expect(items[legacy.id]).toEqual(legacy);
  await expect.poll(() => writes.length).toBe(0);

  await card.getByTestId(`control-option-${legacy.id}-color-amarillo`).click();
  await expect(card.getByTestId(`control-carga-save-${legacy.id}`)).toBeVisible();
  await card.getByTestId(`control-carga-save-${legacy.id}`).click();
  await expect.poll(() => items[legacy.id].color.amarillo).toBe(true);
  expect(items[legacy.id].enfermedades).toEqual({mildiu:true, alternaria:true});
  expect(items[legacy.id].tamano).toEqual({grande:true, pequeno:true});
  expect(items[legacy.id].qcV6).toBeUndefined();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-298–305, UAT-311–312: Carga nueva presenta cinco bloques v6, sin bandejas inspeccionadas y con selecciones coherentes', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = await createNewCargaV6Line(overlay, '26X99980');
  const id = (await card.getAttribute('id')).replace('control-card-', '');

  for (const block of ['color','tamano','sanidad','flores','raices']) await expect(card.getByTestId(`qc-v6-block-${block}`)).toBeVisible();
  await expect(card).not.toContainText('No evaluada');
  await expect(card).not.toContainText('Bandejas inspeccionadas');
  await expect(card).toContainText('Bandejas declaradas: 12');
  for (const block of ['color','tamano','flores','raices']) await expect(card.getByTestId(`qc-v6-block-${block}`).locator('select')).toHaveCount(0);

  await card.getByTestId(`qc-v6-${id}-color-ok`).click();
  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  await expect(card.getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed','true');
  await expect(card.getByTestId(`qc-v6-${id}-color-ok`)).toHaveAttribute('aria-pressed','false');
  await card.getByTestId(`qc-v6-${id}-tamano-ok`).click();
  await card.getByTestId(`qc-v6-${id}-tamano-grande`).click();
  await expect(card.getByTestId(`qc-v6-${id}-tamano-ok`)).toHaveAttribute('aria-pressed','false');
  await card.getByTestId(`qc-v6-${id}-raices-ok`).click();
  await card.getByTestId(`qc-v6-${id}-raices-pocaRaiz`).click();
  await expect(card.getByTestId(`qc-v6-${id}-raices-ok`)).toHaveAttribute('aria-pressed','false');

  await card.getByTestId(`qc-v6-${id}-color-ok`).click();
  await card.getByTestId(`qc-v6-${id}-tamano-ok`).click();
  await card.getByTestId(`qc-v6-${id}-raices-ok`).click();
  await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  await card.getByTestId(`qc-v6-${id}-flores-ok`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');
  await card.getByTestId(`qc-v6-${id}-flores-con_flores`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-flores-ok`).click();
  await expect(card.getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');

  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('10');
  await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveCount(0);
  await expect(card.getByTestId(`qc-v6-${id}-disease-mildiu`)).toHaveAttribute('aria-pressed','false');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-306–310: Carga v6 admite enfermedades independientes y porcentajes válidos con suma máxima de 100', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = await createNewCargaV6Line(overlay, '26X99981');
  const id = (await card.getAttribute('id')).replace('control-card-', '');

  await card.getByTestId(`qc-v6-${id}-disease-mildiu`).click();
  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('20');
  await expect(card.getByTestId(`qc-v6-${id}-percent-alternaria`)).toHaveValue('10');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await expect(card.getByTestId(`qc-v6-${id}-percent-alternaria`)).toHaveCount(0);
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await page.evaluate(id => actualizarControlQcV6EnfermedadPorcentaje(id, 'mildiu', 100), id);
  await expect(page.locator('#app-toast')).toContainText('no puede superar el 100 %');
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('20');
  await card.getByTestId(`qc-v6-${id}-disease-alternaria`).click();
  await card.getByTestId(`qc-v6-${id}-percent-mildiu`).selectOption('100');
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('100');
  await page.evaluate(id => actualizarControlQcV6EnfermedadPorcentaje(id, 'mildiu', 110), id);
  await expect(page.locator('#app-toast')).toContainText('múltiplo de 10');
  await expect(card.getByTestId(`qc-v6-${id}-percent-mildiu`)).toHaveValue('100');
  expect(database['lasala-control-items-v1'][id]?.qcV6?.sanidad?.enfermedades).toEqual({});
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-313–321: Carga v6 calcula el global, respeta ajustes manuales y los recupera al reabrir', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = await createNewCargaV6Line(overlay, '26X99982');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const select = key => card.getByTestId(`qc-v6-${id}-${key}`);

  for (const [key,value] of [['color','ok'],['tamano','ok'],['flores','ok'],['raices','ok']]) await select(`${key}-${value}`).click();
  await select('sanidad-ok').click();
  await expect(select('global')).toHaveValue('0');
  await expect(select('global')).toBeDisabled();
  await select('color-verde').click();
  await expect(select('global')).toHaveValue('20');
  await select('tamano-grande').click();
  await select('disease-mildiu').click();
  await select('percent-mildiu').selectOption('30');
  await expect(select('global')).toHaveValue('40');

  await select('color-ok').click();
  await select('tamano-ok').click();
  await expect(select('global')).toHaveValue('0');
  await select('color-verde').click();
  await select('tamano-grande').click();
  await select('flores-con_flores').click();
  await expect(select('global')).toHaveValue('60');
  await select('global').selectOption('70');
  await select('save').click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.global).toBe(70);
  await select('raices-pocaRaiz').click();
  await expect(select('global')).toHaveValue('80');
  await select('global').selectOption('70');
  await select('save').click();

  await page.reload();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  const reopenedOverlay = page.locator('#control-overlay');
  await reopenedOverlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  const reopened = reopenedOverlay.locator(`#control-card-${id}`);
  await expect(reopened.getByTestId(`qc-v6-${id}-global`)).toHaveValue('70');

  for (const [key,value] of [['color','ok'],['tamano','ok'],['flores','ok'],['raices','ok']]) await reopened.getByTestId(`qc-v6-${id}-${key}-${value}`).click();
  await expect(reopened.getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');
  await reopened.getByTestId(`qc-v6-${id}-global`).selectOption('0');
  await reopened.getByTestId(`qc-v6-${id}-save`).click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.global).toBe(0);
  await page.reload();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  await page.locator('#control-overlay').getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect(page.locator(`#control-card-${id}`).getByTestId(`qc-v6-${id}-global`)).toHaveValue('0');
  expect(database['lasala-control-items-v1'][id].qcV6.sanidad.enfermedades).toEqual({mildiu:30});
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-322–329: Carga v6 guarda una evaluación sin bandejas inspeccionadas, la actualiza y la recupera', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const writes = [];
  page.on('request', request => {
    if (firebaseUrl.test(request.url()) && ['PUT','PATCH','DELETE'].includes(request.method())) writes.push(request.url());
  });
  const card = await createNewCargaV6Line(overlay, '26X99983');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const save = card.getByTestId(`qc-v6-${id}-save`);
  await expect(save).toHaveCount(1);
  await expect(card).not.toContainText('Bandejas inspeccionadas');
  const writesBeforeInvalid = writes.length;
  await save.click();
  await expect(page.locator('#app-toast')).toContainText('Selecciona una opción válida');
  await expect.poll(() => writes.length).toBe(writesBeforeInvalid);

  for (const [key,value] of [['color','ok'],['tamano','ok'],['flores','ok'],['raices','ok']]) await card.getByTestId(`qc-v6-${id}-${key}-${value}`).click();
  await card.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  await save.click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.version).toBe(6);
  await expect(card.getByTestId(`control-status-${id}`)).toHaveText('Inspeccionado');
  await expect(card.getByTestId(`qc-v6-${id}-global-summary`)).toContainText('0 %');
  const writesAfterSave = writes.length;
  await save.click();
  await expect(page.locator('#app-toast')).toContainText('No hay cambios pendientes');
  expect(writes.length).toBe(writesAfterSave);

  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  await save.click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.color).toBe('verde');
  await expect(card).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await page.getByTestId('home-control').click();
  await page.locator('#control-overlay').getByRole('button', { name: 'Check Carga Injerto' }).click();
  const reopened = page.locator(`#control-card-${id}`);
  await expect(reopened.getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed','true');
  await expect(reopened.getByTestId(`control-status-${id}`)).toHaveText('Inspeccionado');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-135–137: QC v6 no avisa sin cambios y protege el borrador al cambiar fecha o sección', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const date = overlay.getByTestId('control-date-picker');
  const card = await createNewTunnelLine(overlay, '26X99135');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const dialogMessages = [];
  let dialogAction = 'dismiss';
  page.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    if (dialogAction === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });

  await overlay.getByTestId('control-day-previous').click();
  await expect(date).toHaveValue('2026-06-29');
  expect(dialogMessages).toEqual([]);
  await overlay.getByTestId('control-day-next').click();
  await expect(date).toHaveValue('2026-06-30');
  const restoredCard = overlay.locator(`#control-card-${id}`);
  await restoredCard.getByTestId(`qc-v6-${id}-color-verde`).click();
  expect(database['lasala-control-items-v1'][id].qcV6.color).toBeNull();

  await overlay.getByTestId('control-day-previous').click();
  await expect.poll(() => dialogMessages.length).toBe(1);
  expect(dialogMessages[0]).toContain('cambios de calidad sin guardar');
  await expect(date).toHaveValue('2026-06-30');
  await expect(restoredCard.getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed', 'true');

  dialogAction = 'accept';
  await overlay.getByTestId('control-day-previous').click();
  await expect(date).toHaveValue('2026-06-29');
  await overlay.getByTestId('control-day-next').click();
  await expect(date).toHaveValue('2026-06-30');
  await expect(overlay.locator(`#control-card-${id}`).getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed', 'false');

  await overlay.locator(`#control-card-${id}`).getByTestId(`qc-v6-${id}-color-verde`).click();
  dialogAction = 'dismiss';
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect.poll(() => dialogMessages.length).toBe(3);
  await expect(overlay.locator('#control-card-'+id)).toBeVisible();
  await expect(overlay.locator('#control-content-wrap')).toContainText('Check Túnel');

  dialogAction = 'accept';
  await overlay.getByRole('button', { name: 'Check Carga Injerto' }).click();
  await expect.poll(() => dialogMessages.length).toBe(4);
  await expect(overlay.locator('#control-content-wrap')).toContainText('E2E-CARGA-QUINCENA-ACTUAL');
  expect(database['lasala-control-items-v1'][id].qcV6.color).toBeNull();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-167 y UAT-169: la evaluación QC v6 está disponible en la tarjeta y reabrir Control sin cambios no avisa', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = await createNewTunnelLine(overlay, '26X99167');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const closeMessages = [];
  page.on('dialog', async dialog => {
    closeMessages.push(dialog.message());
    await dialog.dismiss();
  });

  await expect(card).toBeVisible();
  await expect(card.getByTestId(`qc-v6-${id}-color-ok`)).toBeVisible();
  await expect(card.getByTestId(`qc-v6-${id}-save`)).toBeVisible();
  await expect(card).toContainText('26X99167');

  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await expect(overlay).toBeHidden();
  expect(closeMessages).toEqual([]);

  await page.getByTestId('home-control').click();
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  await expect(overlay.locator(`#control-card-${id}`)).toBeVisible();
  expect(closeMessages).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-170: al cerrar Control con un borrador QC v6 permite conservarlo o descartarlo expresamente', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = await createNewTunnelLine(overlay, '26X99170');
  const id = (await card.getAttribute('id')).replace('control-card-', '');
  const savedQc = structuredClone(database['lasala-control-items-v1'][id].qcV6);
  const dialogMessages = [];
  let dialogAction = 'dismiss';
  page.on('dialog', async dialog => {
    dialogMessages.push(dialog.message());
    if (dialogAction === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });

  await card.getByTestId(`qc-v6-${id}-color-verde`).click();
  expect(database['lasala-control-items-v1'][id].qcV6).toEqual(savedQc);
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await expect.poll(() => dialogMessages.length).toBe(1);
  await expect(dialogMessages[0]).toContain('cambios de calidad sin guardar');
  await expect(overlay).toBeVisible();
  await expect(card.getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed', 'true');

  dialogAction = 'accept';
  await overlay.getByRole('button', { name: '✕ Cerrar' }).click();
  await expect.poll(() => dialogMessages.length).toBe(2);
  await expect(overlay).toBeHidden();
  await page.getByTestId('home-control').click();
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  const reopenedCard = overlay.locator(`#control-card-${id}`);
  await expect(reopenedCard).toBeVisible();
  await expect(reopenedCard.getByTestId(`qc-v6-${id}-color-verde`)).toHaveAttribute('aria-pressed', 'false');
  expect(database['lasala-control-items-v1'][id].qcV6).toEqual(savedQc);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-210–214: consultar registros QC legados no los convierte ni reescribe al abrir', async ({ page }) => {
  const database = fixtureDatabase();
  const legacyId = 'e2e-control-legacy-qc-v5';
  database['lasala-control-items-v1'][legacyId] = {
    id: legacyId, tipo: 'tunel', dia: 30, partida: 'E2E-LEGACY-QC-V5',
    clienteVariedad: 'Fixture histórica sin migrar', invId: '17', calleDesde: 1706, calleHasta: 1706,
    numBandejas: 11, qcLegacy: { version: 5, cantidadesOriginales: { evaluadas: 0, total: 11 } },
    sanidad: { enferma: true }, sanidadEnfermedades: { tuta: true, oidio: true },
    color: { verde: true, amarillo: true }, tamano: { grande: true }
  };
  const original = JSON.stringify(database['lasala-control-items-v1'][legacyId]);
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator(`#control-card-${legacyId}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId(`qc-v6-card-${legacyId}`)).toHaveCount(0);
  expect(JSON.stringify(database['lasala-control-items-v1'][legacyId])).toBe(original);

  await page.reload();
  const reopened = await openControlTunnel(page);
  await expect(reopened.locator(`#control-card-${legacyId}`)).toBeVisible();
  expect(JSON.stringify(database['lasala-control-items-v1'][legacyId])).toBe(original);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-152: mostrar los tramos de calle de QC como segmentos separados', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight-multi-segment');

  await expect(card).toBeVisible();
  await expect(card).toContainText('C/1701-1703, C/1708-1709');
  await expect(card).not.toContainText('C/1701-1709');
  expect(unexpectedHosts).toEqual([]);
});


test('UAT-2433: las dos pantallas leen la última evaluación QC v6 confirmada tras fallar un guardado', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await startControlTest(page, database);
  const firstCard = await createNewTunnelLine(first.overlay, '26X92433');
  const id = (await firstCard.getAttribute('id')).replace('control-card-', '');

  for (const [category, option] of [['color','ok'],['tamano','ok'],['flores','ok'],['raices','ok']]) {
    await firstCard.getByTestId(`qc-v6-${id}-${category}-${option}`).click();
  }
  await firstCard.getByTestId(`qc-v6-${id}-sanidad-ok`).click();
  await firstCard.getByTestId(`qc-v6-${id}-save`).click();
  await expect.poll(() => database['lasala-control-items-v1'][id]?.qcV6?.color).toBe('ok');
  const confirmed = structuredClone(database['lasala-control-items-v1'][id].qcV6);

  const secondPage = await context.newPage();
  try {
    const second = await startControlSecondaryTest(secondPage, database);
    const secondOverlay = second.overlay;
    const secondCard = secondOverlay.locator(`#control-card-${id}`);
    await expect(secondCard.getByTestId(`qc-v6-${id}-color-ok`)).toHaveAttribute('aria-pressed', 'true');
    await secondCard.getByTestId(`qc-v6-${id}-tamano-grande`).click();
    second.unexpectedHosts.setWriteFailure(true);
    await secondCard.getByTestId(`qc-v6-${id}-save`).click();
    await expect(secondPage.locator('#aviso-fallo-guardado')).toContainText('No se ha podido guardar el último cambio');
    second.unexpectedHosts.setWriteFailure(false);
    expect(database['lasala-control-items-v1'][id].qcV6).toEqual(confirmed);

    await Promise.all([page.reload(), secondPage.reload()]);
    const [firstReloaded, secondReloaded] = await Promise.all([
      openControlTunnel(page),
      openControlTunnel(secondPage)
    ]);
    const cards = [
      firstReloaded.locator(`#control-card-${id}`),
      secondReloaded.locator(`#control-card-${id}`)
    ];
    for (const card of cards) {
      await expect(card.getByTestId(`qc-v6-${id}-color-ok`)).toHaveAttribute('aria-pressed', 'true');
      await expect(card.getByTestId(`qc-v6-${id}-tamano-grande`)).toHaveAttribute('aria-pressed', 'false');
    }
    const views = await Promise.all(cards.map(card => card.evaluate(element => ({
      color: element.querySelector('[data-testid$="-color-ok"]')?.getAttribute('aria-pressed'),
      size: element.querySelector('[data-testid$="-tamano-grande"]')?.getAttribute('aria-pressed')
    }))));
    expect(views[0]).toEqual(views[1]);
    expect(database['lasala-control-items-v1'][id].qcV6).toEqual(confirmed);
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-375–376, UAT-387, UAT-391, UAT-393–394 y UAT-398: las fotos se acumulan y las galerías siguen independientes en móvil', async ({ page }) => {
  const database = fixtureDatabase();
  const items = database['lasala-control-items-v1'];
  const firstId = 'e2e-control-current-fortnight';
  const secondId = 'e2e-control-current-fortnight-second-line';
  items[secondId].clienteVariedad = items[firstId].clienteVariedad;
  database['lasala-control-fotos-indice-v1'] = JSON.stringify({});
  database['lasala-control-fotos-shards-index'] = JSON.stringify(['lasala-control-fotos-v1']);
  database['lasala-control-fotos-v1'] = JSON.stringify({});
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  const images = await page.evaluate(() => ['#c62828', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ff8f00'].map((color, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = index % 2 === 0 ? 600 : 200;
    canvas.height = index % 2 === 0 ? 200 : 600;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }));
  const asFile = (image, name) => ({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64')
  });
  const firstCard = overlay.locator(`#control-card-${firstId}`);
  const firstInput = firstCard.locator('input[data-testid^="control-photo-gallery-"]');
  await firstInput.setInputFiles(images.slice(0, 3).map((image, i) => asFile(image, `e2e-uat-375-${i + 1}.png`)));

  const secondCard = overlay.locator(`#control-card-${secondId}`);
  const cameraInput = secondCard.locator('input[data-testid^="control-photo-camera-"]');
  await cameraInput.setInputFiles(asFile(images[3], 'e2e-uat-376-camera-1.png'));
  const secondThumbnails = secondCard.locator('img[title="Ver foto"]');
  await expect(secondThumbnails).toHaveCount(1);
  await cameraInput.setInputFiles(asFile(images[4], 'e2e-uat-387-camera-2.png'));
  await expect(secondThumbnails).toHaveCount(2);
  await secondCard.locator('input[data-testid^="control-photo-gallery-"]').setInputFiles([
    asFile(images[5], 'e2e-uat-376-gallery-1.png'),
    asFile(images[6], 'e2e-uat-376-gallery-2.png')
  ]);

  const firstThumbnails = firstCard.locator('img[title="Ver foto"]');
  await expect(firstThumbnails).toHaveCount(3);
  await expect(secondThumbnails).toHaveCount(4);
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-v1'] || '{}')[firstId]).toHaveLength(3);
  await expect.poll(() => JSON.parse(database['lasala-control-fotos-v1'] || '{}')[secondId]).toHaveLength(4);
  const thumbnailSources = [
    ...await firstThumbnails.evaluateAll(elements => elements.map(element => element.getAttribute('src'))),
    ...await secondThumbnails.evaluateAll(elements => elements.map(element => element.getAttribute('src')))
  ];
  expect(new Set(thumbnailSources).size).toBe(7);

  const fullSources = await page.evaluate(({ firstId, secondId }) => [
    ...controlFotosData[firstId].map(fotoSrcCompleta),
    ...controlFotosData[secondId].map(fotoSrcCompleta)
  ], { firstId, secondId });
  await page.setViewportSize({ width: 320, height: 760 });
  const enlarged = page.locator('#control-foto-ampliada-overlay');
  const thumbnailsToOpen = [firstThumbnails.nth(0), firstThumbnails.nth(2), secondThumbnails.nth(0), secondThumbnails.nth(3)];
  const sourceIndexes = [0, 2, 3, 6];
  for (let i = 0; i < thumbnailsToOpen.length; i++) {
    await thumbnailsToOpen[i].click();
    await expect(enlarged).toBeVisible();
    const image = enlarged.locator('img');
    await expect(image).toHaveAttribute('src', fullSources[sourceIndexes[i]]);
    const box = await image.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(760);
    await enlarged.locator('button').click();
    await expect(enlarged).toBeHidden();
    await expect(overlay).toBeVisible();
  }
  expect(unexpectedHosts).toEqual([]);
});
