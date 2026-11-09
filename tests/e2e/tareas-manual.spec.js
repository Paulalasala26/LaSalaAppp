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

test('UAT-2415: un doble clic rápido en Tareas deja una sola vista funcional y no duplica operaciones', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await expect(page.locator('#page-home')).toBeVisible();

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('tareas')"]`);
  await shortcut.dblclick({ delay: 50 });

  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#tareas-overlay')).toHaveCount(1);
  await expect(overlay.getByText('Resumen de Tareas', { exact: true })).toHaveCount(1);
  await expect(overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' })).toHaveCount(1);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-2412: ADMIN abre Tareas directamente desde Home y carga Operativas y Mantenimiento con sus registros', async ({ page }) => {
  const tomorrowISO = (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  })();
  const tasks = [{
    id: 'e2e-uat-2412-task',
    titulo: 'E2E operativa UAT-2412',
    descripcion: 'Registro de fixture para apertura directa',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  }];
  const tickets = [{
    id: 'e2e-uat-2412-ticket',
    titulo: 'E2E mantenimiento UAT-2412 INV 0A',
    descripcion: 'Ticket de fixture',
    prioridad: 'normal',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: new Date().toISOString().slice(0, 10)
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks),
    'lasala-mantenimiento-v1': JSON.stringify(tickets)
  });

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#tareas-overlay')).toBeHidden();
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toContainText('Resumen de Tareas');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  await expect(overlay.getByText('E2E operativa UAT-2412', { exact: true })).toBeVisible();

  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await expect(overlay).toContainText('E2E mantenimiento UAT-2412 INV 0A');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual(tickets);
  expect(writes).toEqual([]);
});

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

test('UAT-1311: el alta manual rechaza una calle ajena al invernadero sin guardar', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();
  const form = page.locator('#nueva-tarea-form-wrap');
  await form.locator('#nt-titulo').fill('E2E ubicación inválida');
  await form.locator('#nt-inv').selectOption('0A');
  await form.locator('#nt-calles').fill('999');
  await form.locator('[data-nt-asignado-chip="PEON1"]').click();
  await form.getByRole('button', { name: 'Crear y asignar' }).click();

  await expect(page.locator('#app-toast')).toContainText('calle no válido');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);
});

test('UAT-1323: en móvil, los asignables se pliegan y dejan Cancelar y Crear a la vista', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Nueva tarea' }).click();

  const form = overlay.locator('#nueva-tarea-form-wrap');
  const details = form.locator('#nt-asignado-details');
  const summary = form.locator('#nt-asignado-summary');
  const chips = form.locator('#nt-asignado-chips');
  const cancel = form.getByRole('button', { name: 'Cancelar' });
  const create = form.getByRole('button', { name: 'Crear y asignar' });
  await expect(summary).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await expect(chips.locator('[data-nt-asignado-chip="PEON1"]')).toBeHidden();
  await expect(cancel).toBeVisible();
  await expect(create).toBeVisible();

  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await form.locator('[data-nt-asignado-chip="PEON1"]').click();
  await form.locator('[data-nt-asignado-chip="REGANTE1"]').click();
  await expect(summary).toContainText('2 seleccionados');
  await summary.click();
  await expect(chips.locator('[data-nt-asignado-chip="PEON1"]')).toBeHidden();
  await expect(cancel).toBeVisible();
  await expect(create).toBeVisible();

  const detailBox = await details.boundingBox();
  const cancelBox = await cancel.boundingBox();
  const createBox = await create.boundingBox();
  expect(detailBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(createBox).not.toBeNull();
  expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(cancelBox.y);
  expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(createBox.x);
  expect(createBox.y + createBox.height).toBeLessThanOrEqual(844);

  await cancel.click();
  await expect(form).toBeEmpty();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);
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

test('UAT-1312–1314, UAT-1316–1317, UAT-1320–1322, UAT-1324–1325: alta manual conserva datos, origen y estado, sin duplicarse al reabrir', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  const title = 'E2E tarea repetida';
  const description = 'Descripción extensa del caso automatizado. '.repeat(8).trim();
  const tomorrowISO = (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  })();

  async function createTask(expectedCountLabel) {
    await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();
    const form = page.locator('#nueva-tarea-form-wrap');
    await form.locator('#nt-titulo').fill(title);
    await form.locator('#nt-inv').selectOption('0A');
    await form.locator('#nt-calles').fill('1-2');
    await form.locator('#nt-fecha').evaluate((input, value) => { input.value = value; }, tomorrowISO);
    await form.locator('#nt-turno').selectOption('Mañana');
    await form.locator('#nt-desc').fill(description);
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
    descripcion: description,
    asignadoA: 'PEON1',
    origen: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    turno: 'Mañana',
    prioridad: 'alta',
    estado: 'pendiente'
  });
  expect(saved[0].id).toBeTruthy();

  await page.locator('#tareas-overlay').getByRole('button', { name: /Cerrar/ }).click();
  await expect(page.locator('#tareas-overlay')).toBeHidden();
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Tareas de mañana' }).click();
  await expect(page.locator('#tareas-overlay').getByText(title, { exact: false })).toHaveCount(1);
  saved = JSON.parse(database['lasala-tareas-v1']);
  expect(saved).toHaveLength(1);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(1);

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
  saved = JSON.parse(database['lasala-tareas-v1']);
  expect(saved).toHaveLength(2);
  expect(saved.every(task => task.fechaISO === tomorrowISO && task.turno === 'Mañana' && task.descripcion === description && task.prioridad === 'alta')).toBe(true);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(2);
});

test('UAT-1326–1330 y UAT-2418: editar una tarea manual pendiente tras abrir Tareas desde Inicio conserva su ID y mueve solo los datos cambiados', async ({ page }) => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const tomorrowISO = (() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  })();
  const taskId = 'e2e-manual-edit-1326';
  const task = {
    id: taskId,
    titulo: 'E2E tarea editable',
    descripcion: 'Descripción original',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const { database, writes } = await installFixture(page, { 'lasala-tareas-v1': JSON.stringify([task]) });
  await expect(page.locator('#page-home')).toBeVisible();
  const overlay = page.locator('#tareas-overlay');

  async function openEdit(dateView) {
    await overlay.getByRole('button', { name: dateView }).click();
    const row = overlay.locator('.tarea-card').filter({ hasText: /E2E tarea/ });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Editar' }).click();
    return overlay.locator('#nueva-tarea-form-wrap');
  }
  async function save(form) {
    const previousWrites = writes.filter(write => write.key === 'lasala-tareas-v1').length;
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => writes.filter(write => write.key === 'lasala-tareas-v1').length).toBe(previousWrites + 1);
    await expect(page.locator('#app-toast')).toContainText('Cambios guardados');
  }
  function savedTask() {
    const saved = JSON.parse(database['lasala-tareas-v1']);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(taskId);
    return saved[0];
  }

  await openTasks(page);
  let form = await openEdit('Tareas de mañana');
  await expect(form.locator('#et-titulo')).toHaveValue(task.titulo);
  await expect(form.locator('#et-desc')).toHaveValue(task.descripcion);
  await expect(form.locator('#et-inv')).toHaveValue(task.inv);
  await expect(form.locator('#et-calles')).toHaveValue(task.calles);
  await expect(form.locator('#et-fecha')).toHaveValue(tomorrowISO);
  await expect(form.locator('#et-turno')).toHaveValue(task.turno);
  await expect(form.locator('#et-prioridad')).not.toBeChecked();
  await expect(form.locator('[data-et-asignado-chip="PEON1"]')).toHaveClass(/chip-asignado-on/);

  await form.locator('#et-titulo').fill('E2E tarea renombrada');
  await save(form);
  expect(savedTask()).toMatchObject({ titulo: 'E2E tarea renombrada', asignadoA: 'PEON1', fechaISO: tomorrowISO });

  form = await openEdit('Tareas de mañana');
  await form.locator('#et-desc').fill('Descripción actualizada y prioridad alta');
  await form.locator('#et-prioridad').check();
  await save(form);
  expect(savedTask()).toMatchObject({
    titulo: 'E2E tarea renombrada',
    descripcion: 'Descripción actualizada y prioridad alta',
    prioridad: 'alta',
    fechaISO: tomorrowISO,
    asignadoA: 'PEON1'
  });

  form = await openEdit('Tareas de mañana');
  await form.locator('#et-fecha').fill(todayISO);
  await save(form);
  expect(savedTask()).toMatchObject({ fechaISO: todayISO, descripcion: 'Descripción actualizada y prioridad alta', prioridad: 'alta' });
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  await expect(overlay.getByText('E2E tarea renombrada', { exact: false })).toHaveCount(0);

  form = await openEdit('Tareas de hoy');
  await form.locator('#et-inv').selectOption('0B');
  await form.locator('#et-calles').fill('3-4');
  await save(form);
  expect(savedTask()).toMatchObject({
    id: taskId,
    titulo: 'E2E tarea renombrada',
    inv: '0B',
    calles: '3-4',
    fechaISO: todayISO,
    asignadoA: 'PEON1',
    descripcion: 'Descripción actualizada y prioridad alta',
    prioridad: 'alta'
  });
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(4);
  await expect(overlay.locator('.tarea-card').filter({ hasText: 'E2E tarea renombrada' })).toHaveCount(1);
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
