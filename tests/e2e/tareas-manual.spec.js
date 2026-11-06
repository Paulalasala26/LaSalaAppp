const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');

async function installFixture(page, initialData = {}, options = {}) {
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, E2E_TECH: passwordHash, PEON1: passwordHash, REGANTE1: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ADMIN: 'ADMIN', E2E_TECH: 'TECNICO', PEON1: 'PEON', REGANTE1: 'REGANTE' }),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-mantenimiento-v1': JSON.stringify([]),
    ...initialData
  };
  const writes = [];

  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) {
      await route.abort();
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'ETag'
    };
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
    } else if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(database[key] ?? null) });
    } else if (method === 'PUT') {
      if (options.writeDelayMs) await new Promise(resolve => setTimeout(resolve, options.writeDelayMs));
      if (key === 'lasala-mantenimiento-v1' && options.failMantenimientoWrites > 0) {
        options.failMantenimientoWrites -= 1;
        await route.fulfill({ status: 500, contentType: 'text/plain', headers: corsHeaders, body: 'Simulated Firebase write failure' });
        return;
      }
      writes.push({ key, body: route.request().postData() });
      database[key] = JSON.parse(route.request().postData() || 'null');
      await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(database[key]) });
    } else {
      await route.fulfill({ status: 405, headers: corsHeaders, body: 'Method not allowed' });
    }
  });

  await page.goto('/');
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'E2E_ADMIN');
  await page.locator('#login-user').selectOption('E2E_ADMIN');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  return { database, writes };
}

test('UAT-1497–1498, UAT-1505–1506, UAT-1513–1526: Mantenimiento agrupa, etiqueta, cuenta y filtra tickets activos sin alterar datos', async ({ page }) => {
  const tickets = [
    { id: 'e2e-mant-sin-asignar', titulo: 'Hierba INV 1A <urgente & revisar>', descripcion: '', prioridad: 'normal', estado: 'sin_asignar', asignados: [], creadoEn: '2026-11-06' },
    { id: 'e2e-mant-asignado', titulo: 'Sal (INV 1B)', descripcion: '', prioridad: 'normal', estado: 'asignado', asignados: ['PEON1'], creadoEn: '2026-11-06' },
    { id: 'e2e-mant-en-curso', titulo: 'Filtros (INV 18)', descripcion: '', prioridad: 'alta', estado: 'en_proceso', asignados: ['PEON2'], creadoEn: '2026-11-06' },
    { id: 'e2e-mant-cerrado', titulo: 'Basura (INV 2A)', descripcion: '', prioridad: 'normal', estado: 'cerrado', asignados: [], creadoEn: '2026-11-06' }
  ];
  const { database, writes } = await installFixture(page, { 'lasala-mantenimiento-v1': JSON.stringify(tickets) });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  const card = id => overlay.locator(`.tarea-card[data-id="${id}"]`);
  const filter = overlay.getByTestId('mantenimiento-state-filter');
  const search = overlay.getByTestId('mantenimiento-search');
  const count = overlay.getByTestId('mantenimiento-result-count');

  await expect(count).toHaveText('3 tickets en resultados');
  await expect(overlay.getByTestId('mantenimiento-heading-count')).toHaveText('3 tickets abiertos.');
  await expect(overlay).toContainText('Pendiente');
  await expect(overlay).toContainText('En curso');
  await expect(card('e2e-mant-sin-asignar')).toBeVisible();
  await expect(card('e2e-mant-asignado')).toBeVisible();
  await expect(card('e2e-mant-en-curso')).toBeVisible();
  await expect(card('e2e-mant-cerrado')).toHaveCount(0);
  await expect(card('e2e-mant-en-curso')).toContainText('ALTA');
  await expect(card('e2e-mant-en-curso').locator('span').filter({ hasText: 'En proceso' }).first()).toBeVisible();
  await expect(card('e2e-mant-en-curso').getByRole('button', { name: /En proceso|ALTA/ })).toHaveCount(0);
  await expect(filter.locator('option')).toHaveText(['Todos', 'Pendientes', 'En curso']);

  await filter.selectOption('pendientes');
  await expect(count).toHaveText('2 tickets en resultados');
  await expect(card('e2e-mant-sin-asignar')).toBeVisible();
  await expect(card('e2e-mant-asignado')).toBeVisible();
  await expect(card('e2e-mant-en-curso')).toHaveCount(0);
  await filter.selectOption('en_proceso');
  await expect(count).toHaveText('1 tickets en resultados');
  await expect(card('e2e-mant-en-curso')).toBeVisible();
  await expect(card('e2e-mant-asignado')).toHaveCount(0);
  await filter.selectOption('todos');
  await expect(count).toHaveText('3 tickets en resultados');

  for (const [query, expectedId] of [
    ['Sal (INV 1B)', 'e2e-mant-asignado'],
    ['sal', 'e2e-mant-asignado'],
    ['INV 18', 'e2e-mant-en-curso'],
    ['PEON1', 'e2e-mant-asignado']
  ]) {
    await search.fill(query);
    await overlay.getByTestId('mantenimiento-search-apply').click();
    await expect(card(expectedId)).toBeVisible();
    await expect(count).toHaveText('1 tickets en resultados');
    await expect(overlay.locator('.tarea-card:visible')).toHaveCount(1);
  }

  await search.fill('sin coincidencias');
  await overlay.getByTestId('mantenimiento-search-apply').click();
  await expect(overlay.getByTestId('mantenimiento-empty-results')).toContainText('No hay tickets que coincidan');
  await expect(count).toHaveText('0 tickets en resultados');
  await expect(overlay.locator('.tarea-card:visible')).toHaveCount(0);

  await overlay.getByTestId('mantenimiento-clear-filters').click();
  await expect(search).toHaveValue('');
  await expect(filter).toHaveValue('todos');
  await expect(count).toHaveText('3 tickets en resultados');
  await search.fill('PEON2');
  await filter.selectOption('en_proceso');
  await overlay.getByTestId('mantenimiento-search-apply').click();
  await expect(card('e2e-mant-en-curso')).toBeVisible();
  await expect(count).toHaveText('1 tickets en resultados');

  await overlay.getByTestId('mantenimiento-clear-filters').click();
  await search.fill('<urgente & revisar>');
  await overlay.getByTestId('mantenimiento-search-apply').click();
  await expect(card('e2e-mant-sin-asignar')).toBeVisible();
  await expect(card('e2e-mant-sin-asignar')).toContainText('<urgente & revisar>');
  await expect(card('e2e-mant-sin-asignar').locator('img')).toHaveCount(0);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual(tickets);
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(0);
});

async function openTasks(page) {
  await page.locator('#quick-access-block .home-shortcut-card[onclick="handleQuickAction(\'tareas\')"]').click();
  await expect(page.locator('#tareas-overlay')).toBeVisible();
}

test('UAT-1302–1303, UAT-1307–1310 y UAT-1315: abrir, validar y cancelar un alta manual solo ofrece ejecutores operativos', async ({ page }) => {
  const { database, writes } = await installFixture(page);

  await openTasks(page);
  await expect(page.locator('#tareas-overlay')).toContainText('Resumen de Tareas');
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();

  const form = page.locator('#nueva-tarea-form-wrap');
  await expect(form.locator('#nt-titulo')).toBeVisible();
  await expect(form.locator('#nt-inv')).toBeVisible();
  await expect(form.locator('#nt-calles')).toBeVisible();
  await expect(form.locator('#nt-fecha')).toBeVisible();
  await expect(form.locator('#nt-turno')).toBeVisible();
  await expect(form.locator('#nt-desc')).toBeVisible();
  await expect(form.locator('#nt-prioridad')).toBeVisible();
  await expect(form.locator('[data-nt-asignado-chip="PEON1"]')).toBeVisible();
  await expect(form.locator('[data-nt-asignado-chip="REGANTE1"]')).toBeVisible();
  await expect(form.locator('[data-nt-asignado-chip="E2E_ADMIN"]')).toHaveCount(0);
  await expect(form.locator('[data-nt-asignado-chip="E2E_TECH"]')).toHaveCount(0);

  await form.getByRole('button', { name: 'Crear y asignar' }).click();
  await expect(page.locator('#app-toast')).toContainText('Indica al menos un título y a quién se asigna');
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);

  await form.locator('#nt-titulo').fill('E2E tarea no persistida');
  await form.getByRole('button', { name: 'Crear y asignar' }).click();
  await expect(page.locator('#app-toast')).toContainText('Indica al menos un título y a quién se asigna');
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);

  await form.locator('[data-nt-asignado-chip="PEON1"]').click();
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeEmpty();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-1237–1238: cerrar y reabrir Tareas varias veces no duplica vistas ni escribe datos', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  for (let i = 0; i < 3; i++) {
    await openTasks(page);
    await expect(page.locator('#tareas-overlay')).toContainText('Resumen de Tareas');
    await expect(page.locator('#tareas-overlay button', { hasText: 'Mantenimiento de Parcelas' })).toHaveCount(1);
    await expect(page.locator('#tareas-overlay')).toHaveCount(1);
    await page.locator('#tareas-overlay').getByRole('button', { name: /✕ Cerrar/ }).click();
    await expect(page.locator('#tareas-overlay')).toBeHidden();
    await expect(page.locator('#page-home')).toBeVisible();
  }

  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  expect(writes).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('UAT-1316–1317, UAT-1320–1321: guardar tareas manuales conserva IDs y no fusiona títulos iguales', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  const title = 'E2E tarea repetida';

  async function createTask(expectedCountLabel) {
    await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();
    const form = page.locator('#nueva-tarea-form-wrap');
    await form.locator('#nt-titulo').fill(title);
    await form.locator('#nt-inv').selectOption('0A');
    await form.locator('#nt-calles').fill('1-2');
    await form.locator('#nt-fecha').evaluate(input => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      input.value = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    });
    await form.locator('#nt-turno').selectOption('Mañana');
    await form.locator('#nt-desc').fill('Descripción del caso automatizado');
    await form.locator('#nt-prioridad').check();
    await form.locator('[data-nt-asignado-chip="PEON1"]').click();
    await form.getByRole('button', { name: 'Crear y asignar' }).click();
    await expect(page.locator('#tareas-overlay')).toContainText(expectedCountLabel);
  }

  await openTasks(page);
  await createTask('1 pendiente');
  let saved = JSON.parse(database['lasala-tareas-v1']);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    titulo: title,
    descripcion: 'Descripción del caso automatizado',
    asignadoA: 'PEON1',
    origen: 'manual',
    inv: '0A',
    calles: '1-2',
    turno: 'Mañana',
    prioridad: 'alta',
    estado: 'pendiente'
  });
  expect(saved[0].id).toBeTruthy();

  await createTask('2 pendientes');
  saved = JSON.parse(database['lasala-tareas-v1']);
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map(task => task.id)).size).toBe(2);
  expect(saved.map(task => task.titulo)).toEqual([title, title]);

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Tareas de mañana' }).click();
  await expect(page.locator('#tareas-overlay').getByText(title, { exact: false })).toHaveCount(2);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(2);
});

test('UAT-1305–1306, UAT-1318–1319: repartir un alta manual crea una tarea independiente por destinatario', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();
  const form = page.locator('#nueva-tarea-form-wrap');
  await form.locator('#nt-titulo').fill('E2E tarea multiusuario');
  await form.locator('[data-nt-asignado-chip="PEON1"]').click();
  await form.locator('[data-nt-asignado-chip="REGANTE1"]').click();
  await form.getByRole('button', { name: 'Crear y asignar' }).click();
  await expect(page.locator('#tareas-overlay')).toContainText('2 pendientes');

  const saved = JSON.parse(database['lasala-tareas-v1']);
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map(task => task.id)).size).toBe(2);
  expect(saved.map(task => task.asignadoA).sort()).toEqual(['PEON1', 'REGANTE1']);
  expect(saved.every(task => task.titulo === 'E2E tarea multiusuario' && task.origen === 'manual')).toBe(true);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(1);
});

test('UAT-1493–1494, UAT-1496, UAT-1501–1503, UAT-1509 y UAT-1510: ADMIN y TÉCNICO abren Mantenimiento en móvil sin duplicados ni escrituras', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { writes } = await installFixture(page);

  for (const user of ['E2E_ADMIN', 'E2E_TECH']) {
    if (user === 'E2E_TECH') {
      await page.getByRole('button', { name: 'Salir' }).click();
      await expect(page.locator('#login-screen')).toBeVisible();
      await page.locator('#login-user').evaluate((select, value) => {
        if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
      }, user);
      await page.locator('#login-user').selectOption(user);
      await page.locator('#login-pass').fill(password);
      await page.locator('#login-btn').click();
      await expect(page.locator('#page-home')).toBeVisible();
    }
    await openTasks(page);
    const overlay = page.locator('#tareas-overlay');
    const title = overlay.locator('[style*="var(--grad-blue)"] > div').first();
    const close = overlay.getByRole('button', { name: /✕ Cerrar/ });
    await expect(title).toBeVisible();
    await expect(close).toBeVisible();
    const titleBox = await title.boundingBox();
    const closeBox = await close.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(closeBox).not.toBeNull();
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(closeBox.x);
    for (const label of ['Tareas antiguas', 'Tareas de hoy', 'Tareas de mañana', 'Mantenimiento de Parcelas', 'Índice Abonos']) {
      const navButton = overlay.getByRole('button', { name: new RegExp(label) });
      await expect(navButton).toBeVisible();
      const box = await navButton.boundingBox();
      expect(box).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    await overlay.getByRole('button', { name: /Mantenimiento de Parcelas/ }).click();
    await expect(overlay.getByRole('heading', { name: /Mantenimiento de Parcelas/ })).toBeVisible();
    await expect(overlay).toContainText('0 tickets abiertos');
    await expect(overlay.getByTestId('mantenimiento-empty-results')).toBeVisible();
    await expect(overlay.getByTestId('mantenimiento-empty-results')).toContainText('Sin tickets activos');
    const newTicket = overlay.getByRole('button', { name: /Nuevo ticket/ });
    await expect(newTicket).toHaveCount(1);
    await expect(newTicket).toBeVisible();
    await expect(overlay).not.toContainText('Actualizar desde Riego');
    await expect(overlay).not.toContainText('Imprimir lote A5');
    await newTicket.click();
    const ticketForm = overlay.locator('#nuevo-ticket-mant-wrap');
    await expect(ticketForm).toHaveCount(1);
    await expect(ticketForm.locator('#nm-btn-crear')).toHaveCount(1);
    await ticketForm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ticketForm).toBeEmpty();
    if (user === 'E2E_ADMIN') {
      await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
      await expect(overlay).toBeHidden();
      await openTasks(page);
      await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
      await expect(overlay).toContainText('0 tickets abiertos');
    }
    await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
    await expect(overlay).toBeHidden();
  }

  expect(writes).toEqual([]);
});

test('UAT-1531–1534, UAT-1536–1537, UAT-1540–1541 y UAT-1551: seleccionar y cancelar un ticket no crea datos', async ({ page }) => {
  const { writes, database } = await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await overlay.getByRole('button', { name: /Nuevo ticket/ }).click();

  const form = overlay.locator('#nuevo-ticket-mant-wrap');
  const typeButtons = form.locator('.nm-trabajo-btn');
  await expect(typeButtons).toHaveCount(5);
  await expect(form.locator('#nm-btn-crear')).toBeDisabled();
  for (const type of ['hierba', 'sal', 'aspersores', 'basura', 'filtros']) {
    await form.locator(`.nm-trabajo-btn[data-trabajo="${type}"]`).click();
    await expect(form.locator('#nm-paso2')).toBeVisible();
    await expect.poll(() => typeButtons.evaluateAll(buttons => buttons.filter(button => button.style.borderColor === 'rgb(46, 125, 50)').length)).toBe(1);
    await expect(form.locator(`.nm-trabajo-btn[data-trabajo="${type}"]`)).toHaveCSS('background-color', 'rgb(232, 245, 233)');
  }

  const sala1Inv = form.locator('.nm-inv-chk[data-sala="sala1"]').first();
  const sala5Inv = form.locator('.nm-inv-chk[data-sala="sala5"]').first();
  await sala1Inv.check();
  await sala5Inv.check();
  await expect(sala1Inv).toBeChecked();
  await expect(sala5Inv).toBeChecked();
  await sala1Inv.uncheck();
  await expect(sala1Inv).not.toBeChecked();
  await expect(sala5Inv).toBeChecked();
  await sala5Inv.uncheck();

  await form.locator('#nm-btn-crear').click();
  await expect(page.locator('#app-toast')).toContainText('Selecciona al menos un invernadero');
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(0);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);

  await sala1Inv.check();
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeEmpty();
  expect(writes).toEqual([]);
});

test('UAT-1508, UAT-1542–1544, UAT-1546–1548, UAT-1553–1556, UAT-1560–1564: Mantenimiento persiste tickets y planificación tras recargar', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();

  async function startTicketForm() {
    await overlay.getByRole('button', { name: /Nuevo ticket/ }).click();
    const form = overlay.locator('#nuevo-ticket-mant-wrap');
    await form.locator('[data-trabajo="hierba"]').click();
    await expect(form.locator('.nm-inv-chk')).toHaveCount(49);
    await expect(form.locator('.nm-inv-chk:checked')).toHaveCount(0);
    await expect(form.locator('#nm-asignados, [name="asignado"], .nm-asignado-chk')).toHaveCount(0);
    return form;
  }

  let form = await startTicketForm();
  const sala1Inv = form.locator('.nm-inv-chk[data-sala="sala1"]').first();
  const sala5Inv = form.locator('.nm-inv-chk[data-sala="sala5"]').first();
  const invValues = [await sala1Inv.inputValue(), await sala5Inv.inputValue()];
  await sala1Inv.check();
  await sala5Inv.check();
  await form.locator('#nm-prioridad').check();
  const plannedDate = await form.locator('#nm-fecha-programada').evaluate(input => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    input.value = date;
    return date;
  });
  await form.locator('#nm-recurrente').check();
  await form.locator('#nm-recur-cada').fill('2');
  await form.locator('#nm-recur-unidad').selectOption('semanas');
  await form.locator('#nm-btn-crear').click();
  await expect(overlay).toContainText('2 tickets abiertos');

  const saved = JSON.parse(database['lasala-mantenimiento-v1']);
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map(ticket => ticket.id)).size).toBe(2);
  expect(saved.map(ticket => ticket.titulo).sort()).toEqual(invValues.map(inv => `🌾 Hierba (INV ${inv})`).sort());
  for (const ticket of saved) {
    expect(ticket.descripcion).toBe('');
    expect(ticket).toMatchObject({
      prioridad: 'alta', estado: 'sin_asignar', asignados: [], fechaProgramada: plannedDate,
      recurrencia: { cada: 2, unidad: 'semanas' }
    });
    expect(ticket.proximaFecha).toBeTruthy();
  }
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(1);

  await startTicketForm();
  await expect(overlay.locator('.nm-inv-chk:checked')).toHaveCount(0);
  await overlay.locator('#nuevo-ticket-mant-wrap').getByRole('button', { name: 'Cancelar' }).click();
  await expect(overlay).toContainText('2 tickets abiertos');

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await expect(page.locator('#tareas-overlay')).toContainText('2 tickets abiertos');
  await expect(page.locator('#tareas-overlay .tarea-card[data-id]')).toHaveCount(2);
});

test('UAT-1549–1550: Mantenimiento rechaza intervalos recurrentes no válidos sin guardar', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await overlay.getByRole('button', { name: /Nuevo ticket/ }).click();
  const form = overlay.locator('#nuevo-ticket-mant-wrap');
  await form.locator('[data-trabajo="hierba"]').click();
  await form.locator('.nm-inv-chk').first().check();
  await form.locator('#nm-recurrente').check();
  const interval = form.locator('#nm-recur-cada');

  for (const value of ['0', '-2']) {
    await interval.fill(value);
    await form.locator('#nm-btn-crear').click();
    await expect(page.locator('#app-toast')).toContainText('entero mayor que cero');
    await expect(form).toBeVisible();
    expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  }
  await interval.evaluate(input => { input.value = 'abc'; });
  await form.locator('#nm-btn-crear').click();
  await expect(page.locator('#app-toast')).toContainText('entero mayor que cero');
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(0);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
});

test('UAT-1557: doble clic en Crear registra un ticket una sola vez', async ({ page }) => {
  const { database, writes } = await installFixture(page, {}, { writeDelayMs: 250 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await overlay.getByRole('button', { name: /Nuevo ticket/ }).click();
  const form = overlay.locator('#nuevo-ticket-mant-wrap');
  await form.locator('[data-trabajo="hierba"]').click();
  await form.locator('.nm-inv-chk').first().check();
  await form.locator('#nm-btn-crear').dblclick();
  await expect(overlay).toContainText('1 tickets abiertos');
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toHaveLength(1);
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(1);
});

test('UAT-1558–1559: error de guardado conserva el formulario y permite reintentar sin duplicados', async ({ page }) => {
  const options = { failMantenimientoWrites: 3 };
  const { database, writes } = await installFixture(page, {}, options);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await overlay.getByRole('button', { name: /Nuevo ticket/ }).click();
  const form = overlay.locator('#nuevo-ticket-mant-wrap');
  await form.locator('[data-trabajo="hierba"]').click();
  await form.locator('.nm-inv-chk').first().check();
  await form.locator('#nm-btn-crear').click();

  await expect(page.locator('#app-toast')).toContainText('No se pudo guardar el ticket', { timeout: 10000 });
  await expect(form).toBeVisible();
  await expect(form.locator('.nm-inv-chk:checked')).toHaveCount(1);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(0);

  options.failMantenimientoWrites = 0;
  await form.locator('#nm-btn-crear').click();
  await expect(overlay).toContainText('1 tickets abiertos');
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toHaveLength(1);
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(1);
});
