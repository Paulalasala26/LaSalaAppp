const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const expectedFirebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_CONTROL_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase() {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [login.user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [login.user]: 'ADMIN' }),
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
        invernadero: '17'
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

async function interceptFirebase(page, database) {
  const unexpectedHosts = [];
  // Toda petición a la base de producción queda interceptada y atendida en memoria.
  await page.route(firebaseUrl, async route => {
    const request = route.request();
    if (new URL(request.url()).hostname !== expectedFirebaseHost) {
      unexpectedHosts.push(new URL(request.url()).hostname);
      await route.abort();
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readAt(database, path)) });
      return;
    }

    const body = request.postData() ? JSON.parse(request.postData()) : null;
    if (method === 'PUT') writeAt(database, path, body);
    else if (method === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (method === 'DELETE') writeAt(database, path, null);

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return unexpectedHosts;
}

async function openControlTunnel(page, loginFirst = false) {
  if (loginFirst) {
    await page.locator('#login-user').evaluate(select => {
      select.add(new Option('Usuario de automatización', 'E2E_CONTROL_ADMIN'));
    });
    await page.locator('#login-user').selectOption(login.user);
    await page.locator('#login-pass').fill(login.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-control').click();
  const overlay = page.locator('#control-overlay');
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Check Túnel' }).click();
  return overlay;
}

async function startControlTest(page, database) {
  const unexpectedHosts = await interceptFirebase(page, database);
  // El 30/06/2026 pertenece a la segunda quincena del calendario de la app;
  // la prueba queda estable aunque se ejecute en otra fecha.
  await page.clock.setFixedTime(new Date('2026-06-30T10:00:00+02:00'));
  await page.goto('/');
  const overlay = await openControlTunnel(page, true);
  return { overlay, unexpectedHosts };
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

test('UAT-025: Control muestra los datos de cada quincena al cambiar de periodo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const fortnightLabel = overlay.getByTestId('control-quincena-label');
  await expect(fortnightLabel).toContainText('Quincena 2');
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

test('UAT-022: crear una línea de Control la muestra y la guarda', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);

  await overlay.getByTestId('control-add-line').click();
  await page.locator('#nc-cliente-variedad').fill('Fixture de alta E2E');
  await page.locator('#nc-partida').fill('E2E-CONTROL-NUEVA');
  await page.locator('#nc-bandejas').fill('24');
  await overlay.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText('E2E-CONTROL-NUEVA', { exact: true })).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item => item.partida === 'E2E-CONTROL-NUEVA')).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-023: editar una línea de Control solo cambia la línea seleccionada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');

  await card.getByTestId('control-edit-e2e-control-current-fortnight').click();
  const editOverlay = page.locator('#control-editar-overlay');
  await page.locator('#ec-partida').fill('E2E-CONTROL-EDITADA');
  await editOverlay.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText('E2E-CONTROL-EDITADA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-OTRA-LINEA', { exact: true })).toBeVisible();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].partida).toBe('E2E-CONTROL-EDITADA');
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight-second-line'].partida).toBe('E2E-QUINCENA-ACTUAL-OTRA-LINEA');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-024: borrar una línea de Control de prueba la elimina de la base simulada', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');
  page.once('dialog', dialog => dialog.accept());

  await card.getByTestId('control-delete-e2e-control-current-fortnight').click();
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

test('UAT-139, UAT-141, UAT-142 y UAT-144: el filtro de INV funciona con datos y días vacíos', async ({ page }) => {
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
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toHaveCount(0);

  await select.selectOption('');
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toBeVisible();

  await overlay.getByTestId('control-quincena-previous').click();
  await overlay.locator('button[onclick="cambiarControlDia(20)"]').click();
  await expect(overlay.getByText('Sin líneas para este día todavía.', { exact: true })).toBeVisible();
  await expect(overlay.locator('#control-content-wrap select')).toHaveCount(1);
  await expect(overlay.locator('#control-content-wrap select')).toBeVisible();
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
  const partida = 'E2E-QC-MANUAL-NO-IMPORTADA';

  await overlay.getByTestId('control-add-line').click();
  const form = overlay.locator('#nuevo-control-form-wrap > div');
  await expect(form).toHaveCount(1);
  await expect(form.locator('#nc-partida')).toBeVisible();
  await overlay.locator('#nc-cliente-variedad').fill('Fixture manual fuera de PDF o GS');
  await overlay.locator('#nc-partida').fill(partida);
  await overlay.locator('#nc-bandejas').fill('24');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(overlay.getByText(partida, { exact: true })).toBeVisible();
  await expect.poll(() => Object.values(database['lasala-control-items-v1']).some(item =>
    item.partida === partida && item.tipo === 'tunel' && item.dia === 30
  )).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-145, UAT-146 y UAT-147: estado y contadores respetan el INV y la vista activa', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  await overlay.locator('#control-content-wrap select').first().selectOption('17');

  await expect(overlay.getByRole('button', { name: 'Todos (3)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '✓ Completados (1)' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '○ Pendientes (2)' })).toBeVisible();
  await overlay.getByRole('button', { name: '✓ Completados (1)' }).click();
  await expect(overlay.getByText('E2E-QUINCENA-COMPLETADA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toHaveCount(0);
  await overlay.getByRole('button', { name: '○ Pendientes (2)' }).click();
  await expect(overlay.getByText('E2E-QUINCENA-COMPLETADA', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-DIA-30', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-ACTUAL-OTRA-LINEA', { exact: true })).toBeVisible();
  await expect(overlay.getByText('E2E-QUINCENA-INV-18', { exact: true })).toHaveCount(0);

  await overlay.getByRole('button', { name: /Dashboard del día/ }).click();
  await expect(overlay.getByRole('button', { name: /Completados/ })).toHaveCount(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-183, UAT-184 y UAT-185: cambiar opciones de Color, Tamaño y Raíces', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await startControlTest(page, database);
  const card = overlay.locator('#control-card-e2e-control-current-fortnight');

  await card.getByTestId('control-option-e2e-control-current-fortnight-color-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-color-verde').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].color?.verde).toBe(true);

  await card.getByTestId('control-option-e2e-control-current-fortnight-tamano-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].tamano?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-tamano-grande').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].tamano?.grande).toBe(true);

  await card.getByTestId('control-option-e2e-control-current-fortnight-raices-ok').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].raices?.ok).toBe(true);
  await card.getByTestId('control-option-e2e-control-current-fortnight-raices-raizVieja').click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-control-current-fortnight'].raices?.raizVieja).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});
