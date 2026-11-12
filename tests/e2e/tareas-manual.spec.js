const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');

async function fechaISOEnNavegador(page, offsetDays = 0) {
  return page.evaluate(days => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, offsetDays);
}

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
      if (key === 'lasala-tareas-v1' && options.failTareasWrites > 0) {
        options.failTareasWrites -= 1;
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

  const loginUser = options.loginUser || 'E2E_ADMIN';
  await page.goto('/');
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, loginUser);
  await page.locator('#login-user').selectOption(loginUser);
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  return { database, writes };
}

test('UAT-1497–1498, UAT-1505–1506, UAT-1513–1526 y UAT-1530: Mantenimiento agrupa, etiqueta, cuenta y filtra tickets activos sin alterar datos', async ({ page }) => {
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
  await expect(search).toHaveValue('PEON2');

  await filter.selectOption('pendientes');
  await expect(count).toHaveText('0 tickets en resultados');
  await expect(card('e2e-mant-en-curso')).toHaveCount(0);
  await expect(search).toHaveValue('PEON2');
  await filter.selectOption('en_proceso');
  await expect(card('e2e-mant-en-curso')).toBeVisible();
  await expect(count).toHaveText('1 tickets en resultados');
  await expect(search).toHaveValue('PEON2');

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

test('UAT-1234 y UAT-2412: Tareas abre Operativas y Mantenimiento en la primera entrada desde Home', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
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


test('UAT-1249: botones de Operativas y de una tarjeta se manejan con teclado', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const task = {
    id: 'e2e-uat-1249-keyboard-task',
    titulo: 'E2E tarea teclado UAT-1249',
    descripcion: 'Tarea de fixture',
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
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  const tomorrow = overlay.getByRole('button', { name: 'Tareas de mañana' });
  await tomorrow.focus();
  await expect(tomorrow).toBeFocused();
  await tomorrow.press('Enter');
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(card).toBeVisible();
  const edit = card.getByRole('button', { name: 'Editar' });
  await edit.focus();
  await expect(edit).toBeFocused();
  await edit.press('Enter');
  const form = overlay.locator('#nueva-tarea-form-wrap');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeHidden();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});


test('UAT-1259: la tarjeta operativa muestra el horario guardado', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const task = {
    id: 'e2e-uat-1259-horario',
    titulo: 'E2E tarea manual UAT-1259',
    descripcion: 'Descripción visible de la tarea',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    horario: 'Mañana 09:00',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(card).toBeVisible();
  await expect(card).toContainText(task.titulo);
  await expect(card).toContainText(task.descripcion);
  await expect(card).toContainText('Mañana 09:00');
  await expect(card).toContainText('PEON1');
  await expect(card).toContainText(/Pendiente/i);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});




test('UAT-1251: la tarjeta de una tarea manual pendiente muestra todos sus campos', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const task = {
    id: 'e2e-uat-1251-manual-card',
    titulo: 'E2E tarjeta manual UAT-1251',
    descripcion: 'Descripción de la tarea pendiente',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    horario: 'Mañana 09:00',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(card).toBeVisible();
  await expect(card).toContainText(task.titulo);
  await expect(card).toContainText(task.descripcion);
  await expect(card).toContainText(tomorrowISO);
  await expect(card).toContainText('manual');
  await expect(card).toContainText('PEON1');
  await expect(card).toContainText('Mañana 09:00');
  await expect(card).toContainText(/Pendiente/i);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});






test('UAT-1260: botones azules de tarjeta y edición ofrecen una zona táctil de 44 px', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const task = {
    id: 'e2e-uat-1260-touch',
    titulo: 'E2E botones azules UAT-1260',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1',
    fechaISO: todayISO,
    estado: 'pendiente'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: /Tareas de hoy/ }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  const edit = card.getByTitle('Editar');
  const editStyle = await edit.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, background: getComputedStyle(element).backgroundColor };
  });
  expect(editStyle.height).toBeGreaterThanOrEqual(44);
  expect(editStyle.background).toBe('rgb(238, 244, 251)');

  await edit.click();
  const form = overlay.locator('#nueva-tarea-form-wrap');
  const save = form.getByRole('button', { name: 'Guardar cambios' });
  const saveStyle = await save.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, background: getComputedStyle(element).backgroundColor };
  });
  expect(saveStyle.height).toBeGreaterThanOrEqual(44);
  expect(saveStyle.background).toBe('rgb(21, 88, 160)');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1266, UAT-1350–1355: acciones móviles y reasignación solo para pendientes compatibles', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [
    { id: 'e2e-uat-1266-manual', titulo: 'Manual pendiente UAT-1266', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '0A', calles: '1', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1351-riego', titulo: 'Riego pendiente UAT-1351', asignadoA: 'PEON1', origen: 'riego', categoria: 'riego', inv: '0A', calles: '2', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1352-pistola', titulo: 'Pistola UAT-1352', asignadoA: 'PEON1', origen: 'pistola', categoria: 'fumigacion', inv: '0A', calles: '3', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1353-especificos', titulo: 'Específicos UAT-1353', asignadoA: 'REGANTE1', origen: 'especificos', categoria: 'especifico', inv: '0A', calles: '4', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1354-started', titulo: 'Manual iniciada UAT-1354', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '0A', calles: '5', fechaISO: todayISO, estado: 'iniciada' },
    { id: 'e2e-uat-1355-completed', titulo: 'Manual completada UAT-1355', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '0A', calles: '6', fechaISO: todayISO, completadoISO: todayISO, estado: 'completada' }
  ];
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, E2E_TECH: passwordHash, PEON1: passwordHash, PEON2: passwordHash, REGANTE1: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ADMIN: 'ADMIN', E2E_TECH: 'TECNICO', PEON1: 'PEON', PEON2: 'PEON', REGANTE1: 'REGANTE' }),
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: /Tareas de hoy/ }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  const card = title => pane.locator('.tarea-card').filter({ hasText: title });
  const manual = card(tasks[0].titulo);
  const actions = [
    manual.getByTitle('Editar'),
    manual.getByTitle('Reasignar'),
    manual.getByTitle('Anular'),
    manual.getByTitle('Imprimir')
  ];
  for (const action of actions) await expect(action).toBeVisible();
  const rects = await Promise.all(actions.map(action => action.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, height: r.height };
  })));
  for (let i = 0; i < rects.length; i++) {
    expect(rects[i].height).toBeGreaterThanOrEqual(44);
    expect(rects[i].right).toBeLessThanOrEqual(321);
    for (let j = i + 1; j < rects.length; j++) {
      const overlaps = rects[i].left < rects[j].right && rects[i].right > rects[j].left
        && rects[i].top < rects[j].bottom && rects[i].bottom > rects[j].top;
      expect(overlaps).toBe(false);
    }
  }

  const riego = card(tasks[1].titulo);
  const pistola = card(tasks[2].titulo);
  const especificos = card(tasks[3].titulo);
  await expect(riego.getByTitle('Reasignar')).toBeVisible();
  await expect(pistola.getByTitle('Reasignar')).toHaveCount(0);
  await expect(especificos.getByTitle('Reasignar')).toHaveCount(0);
  await expect(card(tasks[4].titulo).getByTitle('Reasignar')).toHaveCount(0);
  await expect(card(tasks[5].titulo).getByTitle('Reasignar')).toHaveCount(0);

  await manual.getByTitle('Reasignar').click();
  const manualSelect = manual.getByTestId('tarea-reasignar-select');
  expect(await manualSelect.evaluate(el => el.multiple)).toBe(false);
  await expect(manualSelect.locator('option[value="PEON2"]')).toHaveCount(1);
  await expect(manualSelect.locator('option[value="REGANTE1"]')).toHaveCount(1);
  await expect(manualSelect.locator('option[value="ADMIN"]')).toHaveCount(0);
  await expect(manualSelect.locator('option[value="TECNICO"]')).toHaveCount(0);
  await manual.getByRole('button', { name: 'Cancelar' }).click();

  await riego.getByTitle('Reasignar').click();
  const riegoSelect = riego.getByTestId('tarea-reasignar-select');
  expect(await riegoSelect.evaluate(el => el.multiple)).toBe(false);
  await expect(riegoSelect.locator('option[value="PEON1"]')).toHaveCount(1);
  await expect(riegoSelect.locator('option[value="PEON2"]')).toHaveCount(1);
  await expect(riegoSelect.locator('option[value="REGANTE1"]')).toHaveCount(0);
  await riego.getByRole('button', { name: 'Cancelar' }).click();

  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});

test('UAT-1356–1359, UAT-1363–1364: reasignación cancelable conserva historial, autor y aviso al nuevo usuario', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [{
    id: 'e2e-uat-1357-peon',
    titulo: 'Manual reasignada a PEON UAT-1357',
    descripcion: 'Mantener descripción y fecha',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    estado: 'pendiente',
    visto: true
  }, {
    id: 'e2e-uat-1358-regante',
    titulo: 'Manual reasignada a REGANTE UAT-1358',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0B',
    calles: '3-4',
    fechaISO: todayISO,
    estado: 'pendiente'
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, E2E_TECH: passwordHash, PEON1: passwordHash, PEON2: passwordHash, REGANTE1: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ADMIN: 'ADMIN', E2E_TECH: 'TECNICO', PEON1: 'PEON', PEON2: 'PEON', REGANTE1: 'REGANTE' }),
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: /Tareas de hoy/ }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  const card = title => pane.locator('.tarea-card').filter({ hasText: title });

  const peonCard = card(tasks[0].titulo);
  await peonCard.getByTitle('Reasignar').click();
  const cancelSelect = peonCard.getByTestId('tarea-reasignar-select');
  expect(await cancelSelect.evaluate(el => el.multiple)).toBe(false);
  await expect(cancelSelect.locator('option[value="ADMIN"]')).toHaveCount(0);
  await expect(cancelSelect.locator('option[value="TECNICO"]')).toHaveCount(0);
  await peonCard.getByRole('button', { name: 'Cancelar' }).click();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);

  await peonCard.getByTitle('Reasignar').click();
  await peonCard.getByTestId('tarea-reasignar-select').selectOption('PEON2');
  await peonCard.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => JSON.parse(database['lasala-tareas-v1']).find(t => t.id === tasks[0].id)?.asignadoA).toBe('PEON2');
  const afterPeon = JSON.parse(database['lasala-tareas-v1']);
  expect(afterPeon).toHaveLength(2);
  expect(afterPeon.find(t => t.id === tasks[0].id)).toMatchObject({
    titulo: tasks[0].titulo,
    descripcion: tasks[0].descripcion,
    fechaISO: todayISO,
    inv: '0A',
    calles: '1-2',
    asignadoA: 'PEON2',
    visto: false,
    historialReasignaciones: [{ anterior: 'PEON1', nuevo: 'PEON2', por: 'E2E_ADMIN', fechaISO: todayISO }]
  });
  expect(afterPeon.find(t => t.id === tasks[0].id).historialReasignaciones[0].fecha).toMatch(/.+/);

  const reganteCard = card(tasks[1].titulo);
  await reganteCard.getByTitle('Reasignar').click();
  const reganteSelect = reganteCard.getByTestId('tarea-reasignar-select');
  await expect(reganteSelect.locator('option[value="REGANTE1"]')).toHaveCount(1);
  await reganteSelect.selectOption('REGANTE1');
  await reganteCard.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => JSON.parse(database['lasala-tareas-v1']).find(t => t.id === tasks[1].id)?.asignadoA).toBe('REGANTE1');
  const final = JSON.parse(database['lasala-tareas-v1']);
  expect(final).toHaveLength(2);
  expect(final.find(t => t.id === tasks[1].id)).toMatchObject({
    titulo: tasks[1].titulo,
    fechaISO: todayISO,
    inv: '0B',
    calles: '3-4',
    asignadoA: 'REGANTE1',
    historialReasignaciones: [{ anterior: 'PEON1', nuevo: 'REGANTE1', por: 'E2E_ADMIN', fechaISO: todayISO }]
  });
  expect(final.find(t => t.id === tasks[1].id).historialReasignaciones[0].fecha).toMatch(/.+/);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(2);
});

test('UAT-1304: el selector plegable muestra usuarios elegibles y actualiza el contador', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: /Tareas de hoy/ }).click();
  await overlay.getByRole('button', { name: 'Nueva tarea' }).click();
  const form = overlay.locator('#nueva-tarea-form-wrap');
  const details = form.locator('#nt-asignado-details');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  const peon = details.locator('[data-nt-asignado-chip="PEON1"]');
  const regante = details.locator('[data-nt-asignado-chip="REGANTE1"]');
  await expect(peon).toBeVisible();
  await expect(regante).toBeVisible();
  await expect(details.locator('[data-nt-asignado-chip="ADMIN"]')).toHaveCount(0);
  await expect(details.locator('[data-nt-asignado-chip="TECNICO"]')).toHaveCount(0);
  await peon.click();
  await expect(details.locator('#nt-asignado-summary')).toHaveText('Asignar a (uno o varios) · 1 seleccionado');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-1262–1264: los contadores coinciden y cada tarea aparece una sola vez', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [{
    id: 'e2e-uat-1262-pending',
    titulo: 'E2E contador pendiente UAT-1262',
    descripcion: 'Tarea pendiente contada',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1',
    fechaISO: todayISO,
    fecha: 'hoy',
    turno: 'Mañana',
    estado: 'pendiente'
  }, {
    id: 'e2e-uat-1262-started',
    titulo: 'E2E contador en curso UAT-1262',
    descripcion: 'Tarea iniciada contada',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '2',
    fechaISO: todayISO,
    fecha: 'hoy',
    turno: 'Mañana',
    estado: 'iniciada',
    horaInicio: '09:00'
  }, {
    id: 'e2e-uat-1263-completed',
    titulo: 'E2E contador completada UAT-1263',
    descripcion: 'Tarea completada reciente',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '3',
    fechaISO: todayISO,
    fecha: 'hoy',
    completadoISO: todayISO,
    turno: 'Mañana',
    estado: 'completada',
    horaFin: '10:00'
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  const today = overlay.getByRole('button', { name: /Tareas de hoy/ });
  await expect(today.locator('span')).toHaveText('2');
  await today.click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  const card = title => pane.locator('.tarea-card').filter({ hasText: title });
  await expect(card(tasks[0].titulo)).toBeVisible();
  await expect(card(tasks[1].titulo)).toBeVisible();
  await expect(card(tasks[2].titulo)).toBeVisible();
  await expect(card(tasks[0].titulo)).toHaveCount(1);
  await expect(card(tasks[1].titulo)).toHaveCount(1);
  await expect(card(tasks[2].titulo)).toHaveCount(1);
  await expect(pane.locator('.tarea-card')).toHaveCount(3);
  await expect(pane.getByText('✓ Completadas (1)', { exact: true })).toBeVisible();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});


test('UAT-1256: tarjetas Pendiente, En proceso y Completada distinguen su estado', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [{
    id: 'e2e-uat-1256-pending',
    titulo: 'E2E estado pendiente UAT-1256',
    descripcion: 'Contenido de pendiente conservado',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1',
    fechaISO: todayISO,
    fecha: 'hoy',
    turno: 'Mañana',
    estado: 'pendiente'
  }, {
    id: 'e2e-uat-1256-started',
    titulo: 'E2E estado iniciado UAT-1256',
    descripcion: 'Contenido de iniciada conservado',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '2',
    fechaISO: todayISO,
    fecha: 'hoy',
    turno: 'Mañana',
    estado: 'iniciada',
    horaInicio: '09:00'
  }, {
    id: 'e2e-uat-1256-completed',
    titulo: 'E2E estado completado reciente UAT-1256',
    descripcion: 'Contenido de completada conservado',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '3',
    fechaISO: todayISO,
    fecha: 'hoy',
    completadoISO: todayISO,
    turno: 'Mañana',
    estado: 'completada',
    horaFin: '10:00'
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  for (const [task, label] of [
    [tasks[0], /Pendiente/i],
    [tasks[1], /En proceso/i],
    [tasks[2], /Completada/i]
  ]) {
    const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
    await expect(card).toBeVisible();
    await expect(card).toContainText(task.descripcion);
    await expect(card).toContainText(label);
  }
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});


test('UAT-1252: la tarjeta Riego pendiente muestra ubicación, responsable, fecha y estado', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const task = {
    id: 'e2e-uat-1252-riego-card',
    titulo: 'Riego UAT-1252 · INV 0A · calles 1-2',
    descripcion: 'Trabajo pendiente de fixture',
    asignadoA: 'PEON1',
    origen: 'riego',
    categoria: 'riego',
    inv: '0A',
    calles: '1-2',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Riego/i);
  await expect(card).toContainText('INV 0A');
  await expect(card).toContainText('1-2');
  await expect(card).toContainText('PEON1');
  await expect(card).toContainText(tomorrowISO);
  await expect(card).toContainText(/Pendiente/i);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});


test('UAT-1253–1254: tarjetas Pistola y Específicos identifican su origen y no exponen acciones manuales', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [{
    id: 'e2e-uat-1253-pistola',
    titulo: 'E2E tarea Pistola UAT-1253',
    descripcion: 'Origen Pistola',
    asignadoA: 'PEON1',
    origen: 'pistola',
    categoria: 'fumigacion',
    inv: '0A',
    calles: '1',
    fechaISO: todayISO,
    estado: 'pendiente'
  }, {
    id: 'e2e-uat-1254-especificos',
    titulo: 'E2E tarea Específicos UAT-1254',
    descripcion: 'Origen Específicos',
    asignadoA: 'PEON1',
    origen: 'especificos',
    categoria: 'especifico',
    inv: '0A',
    calles: '2',
    fechaISO: todayISO,
    estado: 'pendiente'
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: /Tareas de hoy/ }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  for (const task of tasks) {
    const card = pane.locator('.tarea-card').filter({ hasText: task.titulo });
    await expect(card).toBeVisible();
    await expect(card).toContainText(task.origen);
    await expect(card.getByTitle('Imprimir')).toBeVisible();
    await expect(card.getByTitle('Editar')).toHaveCount(0);
    await expect(card.getByTitle('Anular')).toHaveCount(0);
    await expect(card.getByTitle('Eliminar')).toHaveCount(0);
  }
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});

test('UAT-1261 y UAT-1265: ADMIN consulta la tarea y el título largo se ajusta en móvil', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const task = {
    id: 'e2e-uat-1261-admin-controls',
    titulo: 'E2E tarea manual UAT-1261 con título largo para comprobar que el texto y las acciones se ajustan correctamente en una pantalla móvil estrecha',
    descripcion: 'Fixture para revisar las acciones del gestor',
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
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(card).toBeVisible();
  const cardWidth = await card.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth, right: element.getBoundingClientRect().right }));
  expect(cardWidth.scroll).toBeLessThanOrEqual(cardWidth.client);
  expect(cardWidth.right).toBeLessThanOrEqual(390);
  const title = card.getByText(task.titulo, { exact: true });
  const titleWidth = await title.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(titleWidth.scroll).toBeLessThanOrEqual(titleWidth.client);
  await expect(card.getByRole('button', { name: 'Editar' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Imprimir' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Anular' })).toBeVisible();
  await expect(card.getByRole('button', { name: /iniciar|completar|cerrar|finalizar|firmar/i })).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});



test('UAT-1267: cancelar y reabrir el alta en móvil no guarda ni duplica la tarea', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  const create = overlay.getByRole('button', { name: 'Nueva tarea' });
  await create.click();
  const form = page.locator('#nueva-tarea-form-wrap');
  await expect(form).toBeVisible();
  await form.locator('#nt-titulo').fill('Borrador UAT-1267 sin guardar');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeHidden();

  await create.click();
  await expect(form).toBeVisible();
  await expect(form.locator('#nt-titulo')).toHaveValue('');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeHidden();
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);
});


test('UAT-1257–1258: Operativas no inventa calles y conserva varios tramos', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const tasks = [{
    id: 'e2e-uat-1257-no-street',
    titulo: 'E2E sin calle UAT-1257',
    descripcion: 'Sin calles declaradas',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  }, {
    id: 'e2e-uat-1258-multiple-streets',
    titulo: 'E2E varios tramos UAT-1258',
    descripcion: 'Tramos separados del fixture',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0B',
    calles: '1701-1703, 1708-1709',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  }];
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks)
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const noStreet = overlay.locator('.tarea-card').filter({ hasText: tasks[0].titulo });
  await expect(noStreet).toBeVisible();
  await expect(noStreet).toContainText('INV 0A');
  await expect(noStreet).not.toContainText(/C\/\d|Calle \d/i);
  const segments = overlay.locator('.tarea-card').filter({ hasText: tasks[1].titulo });
  await expect(segments).toBeVisible();
  await expect(segments).toContainText('1701-1703, 1708-1709');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});

test('UAT-1255: la descripción larga de una tarjeta Operativas se limita visualmente a tres líneas', async ({ page }) => {
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const description = 'Descripción extensa para comprobar el límite visual de la tarjeta. '.repeat(8).trim();
  const task = {
    id: 'e2e-uat-1255-description',
    titulo: 'E2E descripción larga UAT-1255',
    descripcion: description,
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
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  const descriptionNode = card.getByText(description, { exact: true });
  await expect(descriptionNode).toBeVisible();
  const height = await descriptionNode.evaluate(element => element.getBoundingClientRect().height);
  expect(height).toBeLessThanOrEqual(54);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1232: ADMIN abre Tareas con Operativas seleccionada por defecto', async ({ page }) => {
  test.fail(true, 'La vista actual abre Resumen de Tareas sin seleccionar Operativas.');
  await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toBeVisible();
  const operativas = overlay.getByRole('button', { name: 'Tareas de hoy' });
  await expect(operativas).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('UAT-1233, UAT-1244, UAT-1235, UAT-1236, UAT-1242, UAT-1243, UAT-1246, UAT-1495, UAT-1499, UAT-1500, UAT-1738, UAT-1741, UAT-1745, UAT-1762, UAT-1763, UAT-1764, UAT-1765, UAT-1766, UAT-1780, UAT-1768, UAT-1772, UAT-1773, UAT-1776, UAT-1777, UAT-1779, UAT-1743, UAT-1785 y UAT-1786: Archivo conserva historial sin inventar motivos', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const todayISO = await fechaISOEnNavegador(page);
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const olderISO = await fechaISOEnNavegador(page, -2);
  const recentISO = await fechaISOEnNavegador(page, -1);
  const recentCompletedTask = {
    id: 'e2e-uat-1763-completed-yesterday',
    titulo: 'E2E completada ayer UAT-1763',
    descripcion: 'Completada reciente que aún no entra en Archivo',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0E',
    calles: '5',
    fechaISO: recentISO,
    completadoISO: recentISO,
    estado: 'completada'
  };
  const oldPendingTask = {
    id: 'e2e-uat-1772-old-pending',
    titulo: 'E2E pendiente antigua UAT-1772',
    descripcion: 'Pendiente antigua que se conserva en su circuito',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0D',
    calles: '4',
    fechaISO: olderISO,
    estado: 'pendiente'
  };
  const tasks = [{
    id: 'e2e-uat-1232-task',
    titulo: 'E2E operativa UAT-1232',
    descripcion: 'Tarea aislada para recorrer secciones',
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
  }, {
    id: 'e2e-uat-1741-archived-task',
    titulo: 'E2E tarea anulada UAT-1741',
    descripcion: 'Registro histórico para validar Archivo tras cambiar fecha',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    motivoAnulacion: 'Fixture de navegación UAT-1741',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'anulada'
  }, {
    id: 'e2e-uat-1786-legacy-cancelled',
    titulo: 'E2E anulación legacy sin motivo UAT-1786',
    descripcion: 'Registro histórico sin justificación almacenada',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0F',
    calles: '7',
    fechaISO: olderISO,
    estado: 'anulada'
  }, {
    id: 'e2e-uat-1766-cancelled-riego',
    titulo: 'E2E Riego anulado UAT-1766',
    descripcion: 'Tarea de riego anulada por sustitución de trabajo',
    asignadoA: 'PEON3',
    origen: 'riego',
    categoria: 'riego',
    inv: '1A',
    calles: '3-4',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    motivoAnulacion: 'Cambio de instrucciones UAT-1780',
    estado: 'anulada'
  }, {
    id: 'e2e-uat-1762-completed-task',
    titulo: 'E2E completada histórica UAT-1762',
    descripcion: 'Completada histórica para validar Archivo',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0C',
    calles: '3',
    fechaISO: olderISO,
    completadoISO: olderISO,
    estado: 'completada'
  }, oldPendingTask, recentCompletedTask];
  const closedTicket = {
    id: 'e2e-uat-1500-closed-ticket',
    titulo: 'E2E ticket cerrado UAT-1500',
    prioridad: 'normal',
    estado: 'cerrado',
    asignados: [],
    creadoEn: todayISO,
    cerradoEn: todayISO
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify(tasks),
    'lasala-mantenimiento-v1': JSON.stringify([closedTicket])
  });

  const assertOperativas = async (expectedTaskTitle = 'E2E operativa UAT-1232') => {
    const overlay = page.locator('#tareas-overlay');
    for (const name of ['Tareas antiguas', 'Tareas de hoy', 'Tareas de mañana', 'Archivo', 'Mantenimiento de Parcelas']) {
      await expect(overlay.getByRole('button', { name })).toBeVisible();
    }
    const tomorrow = overlay.getByRole('button', { name: 'Tareas de mañana' });
    await tomorrow.click();
    await expect(tomorrow).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(overlay.getByText(expectedTaskTitle, { exact: true })).toBeVisible();
    await expect(overlay.locator('.tarea-card:visible')).toHaveCount(1);
  };

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toContainText('Resumen de Tareas');
  const today = overlay.getByRole('button', { name: 'Tareas de hoy' });
  await today.click();
  await expect(today).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  await expect(pane).toContainText(/no hay tareas|sin tareas/i);
  await expect(pane.locator('.tarea-card:visible')).toHaveCount(0);
  await expect(overlay.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();
  await assertOperativas();

  const maintenance = overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' });
  await maintenance.click();
  await expect(maintenance).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay.getByRole('heading', { name: /Mantenimiento de Parcelas/ })).toBeVisible();
  await expect(overlay).toContainText('0 tickets abiertos');
  await assertOperativas();
  await maintenance.click();
  await expect(maintenance).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay).toContainText('0 tickets abiertos');
  await assertOperativas();

  const archive = overlay.getByRole('button', { name: /Archivo/ });
  await archive.click();
  await expect(archive).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const archiveView = overlay.locator('#tareas-gestor-content-wrap');
  const archivePane = overlay.locator('#tareas-archivo-anuladas');
  await expect(archivePane).toContainText('Anuladas y archivadas');
  const archivedMaintenance = archiveView.locator('#mantenimiento-archivo');
  await expect(archivedMaintenance).toContainText(closedTicket.titulo);
  await expect(archivedMaintenance).toContainText('Cerrado');
  await expect(archivedMaintenance).toContainText(todayISO);
  await expect(archivePane).not.toContainText(closedTicket.titulo);
  const archivedTask = archivePane.locator('.tarea-archivo-card').filter({ hasText: 'E2E tarea anulada UAT-1741' });
  await expect(archivedTask).toContainText('Anulada');
  await expect(archivedTask).not.toContainText('Completada');
  await expect(archivedTask).toContainText('Registro histórico para validar Archivo tras cambiar fecha');
  await expect(archivedTask).toContainText('Fixture de navegación UAT-1741');
  await expect(archivedTask).toContainText(todayISO);
  await expect(archivedTask).toContainText('PEON1');
  const legacyArchiveTask = archivePane.locator('.tarea-archivo-card').filter({ hasText: 'E2E anulación legacy sin motivo UAT-1786' });
  await expect(legacyArchiveTask).toContainText('Anulada');
  await expect(legacyArchiveTask).toContainText('Registro histórico sin justificación almacenada');
  await expect(legacyArchiveTask.locator('.tarea-archivo-motivo')).toHaveCount(0);
  await expect(legacyArchiveTask).not.toContainText('Anulación administrativa');
  const archivedRiegoTask = archivePane.locator('.tarea-archivo-card').filter({ hasText: 'E2E Riego anulado UAT-1766' });
  await expect(archivedRiegoTask).toContainText('Anulada');
  await expect(archivedRiegoTask).toContainText(/riego/i);
  await expect(archivedRiegoTask).toContainText('INV 1A');
  await expect(archivedRiegoTask).toContainText(todayISO);
  await expect(archivedRiegoTask).toHaveAttribute('data-tarea-id', 'e2e-uat-1766-cancelled-riego');
  await expect(archivePane).not.toContainText('E2E operativa UAT-1232');
  const oldTasksTab = overlay.getByRole('button', { name: 'Tareas antiguas' });
  await oldTasksTab.click();
  const oldTaskCard = overlay.locator('.tarea-card').filter({ hasText: oldPendingTask.titulo });
  await expect(oldTaskCard).toBeVisible();
  await expect(oldTaskCard).toContainText('Pendiente');
  await archive.click();
  await expect(archive).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const completedArchive = archiveView.locator('#tareas-archivo-completadas').locator('.tarea-archivo-card').filter({ hasText: 'E2E completada histórica UAT-1762' });
  await expect(completedArchive).toContainText('Completada');
  await expect(completedArchive).toContainText(olderISO);
  await expect(archiveView.locator('#tareas-archivo-completadas').filter({ hasText: recentCompletedTask.titulo })).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(JSON.parse(database['lasala-tareas-v1']).find(task => task.id === oldPendingTask.id).estado).toBe('pendiente');
  expect(writes).toEqual([]);
  await assertOperativas();
  await archive.focus();
  await expect(archive).toBeFocused();
  await archive.press('Enter');
  await expect(archive).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay.locator('#tareas-archivo-anuladas')).toContainText('Anuladas y archivadas');
  await maintenance.click();
  await expect(maintenance).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay).toContainText('0 tickets abiertos');
  await assertOperativas();
  await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(overlay).toBeHidden();

  const technicianTasks = [{
    id: 'e2e-uat-1743-technician-pending',
    titulo: 'E2E tarea técnica UAT-1743',
    descripcion: 'Resultado nuevo de la sesión TÉCNICO',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0B',
    calles: '6',
    fechaISO: tomorrowISO,
    fecha: 'mañana',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  }, {
    id: 'e2e-uat-1743-technician-archived',
    titulo: 'E2E archivo técnico UAT-1743',
    descripcion: 'Solo disponible tras cambiar de usuario',
    asignadoA: 'PEON2',
    origen: 'manual',
    categoria: 'manual',
    inv: '0B',
    calles: '6',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    motivoAnulacion: 'Fixture de sesión TÉCNICO',
    estado: 'anulada'
  }];
  database['lasala-tareas-v1'] = JSON.stringify(technicianTasks);
  database['lasala-mantenimiento-v1'] = JSON.stringify([]);

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'E2E_TECH');
  await page.locator('#login-user').selectOption('E2E_TECH');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  for (const label of ['Historial', 'Trabajos', 'Clima', 'La Sala en Vivo']) {
    await expect(page.locator('#quick-access-block .home-shortcut-card').filter({ hasText: label })).toBeHidden();
  }

  // La sesión nueva debe consultar el fixture actual, no conservar el resultado del usuario anterior.
  await openTasks(page);
  const technicianOverlay = page.locator('#tareas-overlay');
  await expect(technicianOverlay).toContainText('Resumen de Tareas');
  await expect(technicianOverlay.getByRole('button', { name: /Respaldo JSON/ })).toHaveCount(0);
  await assertOperativas('E2E tarea técnica UAT-1743');
  const technicianArchive = technicianOverlay.getByRole('button', { name: /Archivo/ });
  await technicianArchive.click();
  const technicianArchiveView = technicianOverlay.locator('#tareas-archivo-anuladas');
  await expect(technicianArchiveView).toContainText('E2E archivo técnico UAT-1743');
  await expect(technicianArchiveView).not.toContainText('E2E tarea anulada UAT-1741');
  await expect(technicianArchiveView).not.toContainText('E2E Riego anulado UAT-1766');
  await expect(technicianOverlay.locator('#mantenimiento-archivo')).not.toContainText(closedTicket.titulo);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(technicianTasks);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  expect(writes).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('UAT-1239, UAT-1241, UAT-2083 y UAT-2087: PEÓN consulta Mis tareas y no accede a accesos administrativos', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const task = {
    id: 'e2e-uat-1239-peon',
    titulo: 'E2E tarea PEON UAT-1239',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente',
    visto: true
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'PEON1');
  await page.locator('#login-user').selectOption('PEON1');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#quick-access-block')).toBeHidden();
  for (const shortcut of ['#shortcut-historial', '#shortcut-trabajos', '#shortcut-sala-en-vivo', '#shortcut-clima']) {
    await expect(page.locator(shortcut)).toBeHidden();
  }
  const inline = page.locator('#peon-tareas-inline');
  await expect(inline).toContainText(task.titulo);

  await page.evaluate(() => handleQuickAction('tareas'));
  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Mis tareas');
  await expect(overlay).toContainText(task.titulo);
  await expect(overlay).not.toContainText('Resumen de Tareas');
  await expect(overlay.getByRole('button', { name: 'Nueva tarea' })).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1240: REGANTE ve su tarea manual desde Mis tareas', async ({ page }) => {
  test.fail(true, 'La sesión REGANTE no muestra el acceso Mis tareas aunque sí muestra Hojas de riego.');
  const task = {
    id: 'e2e-uat-1240-regante',
    titulo: 'E2E tarea REGANTE UAT-1240',
    asignadoA: 'REGANTE1',
    origen: 'manual',
    categoria: 'manual',
    inv: '17',
    calles: '3-4',
    fechaISO: await fechaISOEnNavegador(page),
    estado: 'pendiente',
    visto: true
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.reload();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'REGANTE1');
  await page.locator('#login-user').selectOption('REGANTE1');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.getByRole('button', { name: /Hojas de riego/ })).toBeVisible();
  const tasksButton = page.locator('#quick-access-block').getByRole('button', { name: /Mis tareas/ });
  await expect(tasksButton).toBeVisible();
  await tasksButton.click();

  const overlay = page.locator('#tareas-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(task.titulo);
  await expect(overlay).not.toContainText('Resumen de Tareas');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1247 y UAT-1248, UAT-1302–1303, UAT-1307–1310 y UAT-1315: abrir, validar y cancelar un alta manual solo ofrece ejecutores operativos', async ({ page }) => {
  const { database, writes } = await installFixture(page);

  await openTasks(page);
  await expect(page.locator('#tareas-overlay')).toContainText('Resumen de Tareas');
  const overlay = page.locator('#tareas-overlay');
  const todayTab = overlay.getByRole('button', { name: 'Tareas de hoy' });
  await todayTab.click();
  await expect(todayTab).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();
  await overlay.getByRole('button', { name: 'Nueva tarea' }).click();

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
  await expect(form).toBeHidden();

  await page.setViewportSize({ width: 390, height: 560 });
  await expect(overlay).toBeVisible();
  await expect(todayTab).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(overlay.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();
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
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const olderISO = await fechaISOEnNavegador(page, -3);

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
  const todayISO = await fechaISOEnNavegador(page, 0);
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
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

test('UAT-2426: si falla el guardado del alta manual para varios destinatarios no anuncia éxito ni confirma asignaciones', async ({ page }) => {
  const options = { failTareasWrites: 3 };
  const { database, writes } = await installFixture(page, {}, options);
  await openTasks(page);
  await page.locator('#tareas-overlay').getByRole('button', { name: 'Nueva tarea' }).click();
  const form = page.locator('#nueva-tarea-form-wrap');
  await form.locator('#nt-titulo').fill('E2E alta parcial');
  await form.locator('[data-nt-asignado-chip="PEON1"]').click();
  await form.locator('[data-nt-asignado-chip="REGANTE1"]').click();
  await form.getByRole('button', { name: 'Crear y asignar' }).click();

  await expect(page.locator('#app-toast')).toContainText('No se confirmó ninguna tarea');
  await expect(page.locator('#app-toast')).toContainText('PEON1, REGANTE1');
  expect(options.failTareasWrites).toBe(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);
  await expect(form).toBeVisible();
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

test('UAT-1531–1534, UAT-1536–1538, UAT-1540–1541 y UAT-1551: seleccionar y cancelar un ticket no crea datos', async ({ page }) => {
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

  const sala1Checks = await form.locator('.nm-inv-chk[data-sala="sala1"]').all();
  expect(sala1Checks.length).toBeGreaterThan(0);
  for (const inv of sala1Checks) await inv.check();
  await expect(form.locator('.nm-inv-chk[data-sala="sala1"]:checked')).toHaveCount(sala1Checks.length);
  await expect(form.locator('.nm-inv-chk[data-sala="sala2"]:checked')).toHaveCount(0);
  for (const inv of sala1Checks) await inv.uncheck();

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

test('UAT-2425: si falla el archivado de Mantenimiento el ticket sigue activo y no anuncia éxito', async ({ page }) => {
  const ticket = {
    id: 'e2e-maint-archive-error',
    titulo: 'E2E archivado con error',
    descripcion: 'Fixture para error remoto',
    prioridad: 'normal',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: '2026-11-09'
  };
  const options = { failMantenimientoWrites: 3 };
  const { database, writes } = await installFixture(page, {
    'lasala-mantenimiento-v1': JSON.stringify([ticket])
  }, options);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: ticket.titulo });
  await expect(card).toBeVisible();

  page.on('dialog', dialog => dialog.accept());
  await card.locator('button[title="Eliminar"]').click();

  await expect(page.locator('#aviso-fallo-guardado')).toContainText('No se ha podido guardar el último cambio');
  await expect(page.locator('#app-toast')).toHaveCount(0);
  await expect(card).toBeVisible();
  expect(options.failMantenimientoWrites).toBe(0);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([ticket]);
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(0);
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

test('UAT-1739 y UAT-2434: Archivo vacío no registra la anulación fallida ni oculta la tarea activa', async ({ page }) => {
  const fechaISO = await fechaISOEnNavegador(page, 0);
  const task = {
    id: 'e2e-uat-2434-task',
    titulo: 'E2E tarea activa UAT-2434',
    descripcion: 'Fixture para probar una anulación fallida',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO,
    fecha: 'hoy',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const options = { failTareasWrites: 3 };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  }, options);
  let taskPutAttempts = 0;
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/lasala-tareas-v1.json')) taskPutAttempts++;
  });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  let row = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(row).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Anular' }).click();
  await expect(page.locator('#app-toast')).toContainText('sigue activa', { timeout: 10000 });
  expect(options.failTareasWrites).toBe(0);
  expect(taskPutAttempts).toBe(3);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(0);

  await overlay.getByRole('button', { name: 'Archivo' }).click();
  const archived = overlay.locator('#tareas-archivo-anuladas');
  await expect(archived).toContainText('Anuladas y archivadas');
  await expect(archived).toContainText('No hay registros.');
  await expect(archived).not.toContainText(task.titulo);

  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  row = overlay.locator('.tarea-card').filter({ hasText: task.titulo });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Pendiente');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
});

test('UAT-1268–1297: Operativas permite filtrar por fecha, estado, origen, sala y asignado, y buscar tareas', async ({ page }) => {
  test.fail(true, 'La vista Operativas actual se divide en secciones por fecha y no tiene filtros combinados de fecha ni búsqueda.');
  const todayISO = await fechaISOEnNavegador(page);
  const tomorrowISO = await fechaISOEnNavegador(page, 1);
  const tasks = [
    { id: 'e2e-uat-1268-today', titulo: 'E2E FILTRO HOY UAT-1268', descripcion: 'Búsqueda de descripción UAT-1276', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '0A', calles: '1', fechaISO: todayISO, turno: 'Mañana', prioridad: 'normal', estado: 'pendiente' },
    { id: 'e2e-uat-1268-tomorrow', titulo: 'E2E FILTRO MAÑANA UAT-1270', descripcion: 'Tarea futura', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '0B', calles: '2', fechaISO: tomorrowISO, turno: 'Mañana', prioridad: 'normal', estado: 'pendiente' }
  ];
  const { database, writes } = await installFixture(page, { 'lasala-tareas-v1': JSON.stringify(tasks) });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  await expect(pane).toContainText('E2E FILTRO HOY UAT-1268');
  await expect(pane.locator('.tarea-card:visible')).toHaveCount(1);

  const controls = await pane.evaluate(element => {
    const candidates = [...element.querySelectorAll('input, select, button')];
    const label = control => [
      control.id,
      control.getAttribute('aria-label'),
      control.getAttribute('placeholder'),
      control.getAttribute('title'),
      control.textContent
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return {
      search: candidates.some(c => c.matches('input[type="search"], [data-testid*="search"]') || /buscar|search/.test(label(c))),
      dateFilter: candidates.some(c => c.matches('input[type="date"]') || (/fecha|date/.test(label(c)) && c.id !== 'lote-asignado-select')),
      advanced: candidates.some(c => /filtros avanzados/.test(label(c))),
      status: candidates.some(c => c.tagName === 'SELECT' && /estado|status/.test(label(c))),
      origin: candidates.some(c => c.tagName === 'SELECT' && /origen|source/.test(label(c))),
      room: candidates.some(c => c.tagName === 'SELECT' && /sala|invernadero/.test(label(c))),
      assignee: candidates.some(c => c.tagName === 'SELECT' && c.id !== 'lote-asignado-select' && /asignado|operario/.test(label(c))),
      clear: candidates.some(c => c.tagName === 'BUTTON' && /limpiar filtros/.test(label(c)))
    };
  });
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
  expect(controls).toEqual({ search: true, dateFilter: true, advanced: true, status: true, origin: true, room: true, assignee: true, clear: true });
});

test('UAT-1734, UAT-1735, UAT-1736–1737, UAT-1740, UAT-1742 y UAT-1744: Archivo conserva navegación y consulta entre sesiones', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const cancelled = {
    id: 'e2e-uat-1734-cancelled',
    titulo: 'E2E tarea anulada UAT-1734',
    descripcion: 'Histórico solo consulta',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    motivoAnulacion: 'Prueba de archivo',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'anulada'
  };
  const active = {
    id: 'e2e-uat-1734-active',
    titulo: 'E2E tarea activa UAT-1734',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const ticket = {
    id: 'e2e-uat-1734-ticket',
    titulo: 'E2E ticket activo UAT-1737',
    descripcion: 'Mantenimiento de fixture',
    prioridad: 'normal',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: todayISO
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([cancelled, active]),
    'lasala-mantenimiento-v1': JSON.stringify([ticket])
  });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  const archive = overlay.locator('#tareas-archivo-anuladas');
  const openArchive = async () => {
    await overlay.getByRole('button', { name: 'Archivo' }).click();
    await expect(archive).toBeVisible();
    await expect(archive).toContainText('Anuladas y archivadas');
    await expect(archive).toContainText(cancelled.titulo);
    await expect(archive.getByText(cancelled.titulo, { exact: true })).toHaveCount(1);
  };

  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  await expect(overlay).toContainText(active.titulo);
  await openArchive();
  await expect(archive).not.toContainText(active.titulo);
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  await expect(overlay).toContainText(active.titulo);
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  await expect(overlay).toContainText(ticket.titulo);
  await openArchive();
  await openArchive();

  await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(overlay).toBeHidden();
  await openTasks(page);
  await openArchive();
  await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(overlay).toBeHidden();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.reload();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'E2E_TECH');
  await page.locator('#login-user').selectOption('E2E_TECH');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  await openTasks(page);
  await openArchive();
  await expect(archive.getByRole('button', { name: 'Anular' })).toHaveCount(0);

  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([cancelled, active]);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([ticket]);
  expect(writes).toEqual([]);
});

test('UAT-1746–1747, UAT-1753 y UAT-1755: Archivo separa estados y conserva el detalle de consulta', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const completedISO = await fechaISOEnNavegador(page, -3);
  const completed = {
    id: 'e2e-uat-1746-completed',
    titulo: 'E2E tarea completada UAT-1746',
    descripcion: 'Detalle histórico de la tarea completada',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: completedISO,
    completadoISO: completedISO,
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'completada'
  };
  const archivedTicket = {
    id: 'e2e-uat-1755-maintenance',
    titulo: 'E2E ticket archivado UAT-1755',
    estado: 'archivado',
    creadoEn: todayISO,
    archivadoEn: todayISO,
    asignados: ['PEON1']
  };
  const cancelled = {
    id: 'e2e-uat-1746-cancelled',
    titulo: 'E2E tarea anulada UAT-1746',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'anulada'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([completed, cancelled]),
    'lasala-mantenimiento-v1': JSON.stringify([archivedTicket])
  });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Archivo' }).click();
  const completedArchive = overlay.locator('#tareas-archivo-completadas');
  const cancelledArchive = overlay.locator('#tareas-archivo-anuladas');
  const completedCard = completedArchive.locator('[data-tarea-id="e2e-uat-1746-completed"]');
  await expect(completedArchive.locator('h3')).toContainText('Completadas');
  await expect(cancelledArchive.locator('h3')).toContainText('Anuladas y archivadas');
  await expect(completedCard).toContainText(completed.titulo);
  await expect(completedCard).toContainText(completed.descripcion);
  await expect(completedCard).toContainText(completedISO);
  await expect(completedCard).toContainText('PEON1');
  await expect(completedCard).toContainText('INV 0A');
  await expect(completedCard).toContainText('Completada');
  await expect(completedCard.locator('button')).toHaveCount(0);
  await expect(cancelledArchive).not.toContainText(completed.titulo);
  await expect(cancelledArchive).toContainText(cancelled.titulo);
  await expect(completedArchive).not.toContainText(cancelled.titulo);
  const archivedTicketCard = overlay.locator('#mantenimiento-archivo [data-ticket-id="e2e-uat-1755-maintenance"]');
  await expect(archivedTicketCard).toContainText(archivedTicket.titulo);
  await expect(archivedTicketCard).toContainText('Archivado');
  await expect(archivedTicketCard).not.toContainText('Completada');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([completed, cancelled]);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([archivedTicket]);
  expect(writes).toEqual([]);
});


test('UAT-1748–1752, UAT-1754, UAT-1757–1758: Archivo agrupa, filtra y conserva metadatos históricos', async ({ page }) => {
  test.fail(true, 'Archivo no ofrece las secciones, filtros y metadatos completos que pide la hoja QC.');
  const task = {
    id: 'e2e-uat-1748-archive',
    titulo: 'E2E histórico UAT-1748',
    descripcion: 'Descripción de prueba',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: '2026-11-05',
    anuladaISO: '2026-11-06',
    motivoAnulacion: 'Sustituida por prueba QC',
    horario: 'Mañana',
    estado: 'anulada'
  };
  const { database, writes } = await installFixture(page, {
    'lasala-tareas-v1': JSON.stringify([task])
  });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Archivo' }).click();
  const archive = overlay.locator('#tareas-archivo-anuladas');
  const observed = await archive.evaluate(element => {
    const text = element.innerText || '';
    return {
      completed: text.includes('Completadas'),
      cancelled: text.includes('Anuladas y archivadas'),
      filters: Boolean(element.querySelector('input[type="search"], input[type="date"], select')),
      clear: [...element.querySelectorAll('button')].some(button => /limpiar filtros/i.test(button.textContent || '')),
      reason: text.includes('Sustituida por prueba QC'),
      origin: text.includes('Manual'),
      originalDate: text.includes('2026-11-05')
    };
  });
  await expect(archive).toContainText(task.titulo);
  expect(observed).toEqual({ completed: true, cancelled: true, filters: true, clear: true, reason: true, origin: true, originalDate: true });
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1756, UAT-1759–1760: tarjeta de Archivo admite texto largo, campos vacíos y consulta segura', async ({ page }) => {
  const title = 'E2E histórico UAT-1756 con un título largo para revisar lectura de la tarjeta';
  const description = 'Texto de prueba extenso para verificar que no se pierde al mostrar el histórico.';
  const task = { id: 'e2e-uat-1756', titulo: title, descripcion: description, asignadoA: 'PEON1', origen: 'manual', inv: '0A', calles: '1-2', fechaISO: '2026-11-06', anuladaISO: '2026-11-06', estado: 'anulada' };
  const { database, writes } = await installFixture(page, { 'lasala-tareas-v1': JSON.stringify([task]) });
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Archivo' }).click();
  const card = overlay.locator('#tareas-archivo-anuladas .tarea-card');
  await expect(card).toContainText(title);
  await expect(card).toContainText(description);
  await expect(card).not.toContainText(/undefined|NaN/);
  await expect(card.getByRole('button', { name: /Iniciar|Completar|Reasignar|Borrar|Anular|Editar/ })).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([task]);
  expect(writes).toEqual([]);
});

test('UAT-1986 y UAT-1987: los recursos PWA declaran iconos cuadrados y Apple touch icon', async ({ page }) => {
  await page.goto('/');
  const resources = await page.evaluate(async () => {
    const manifestResponse = await fetch('/manifest.json');
    const manifest = manifestResponse.ok ? await manifestResponse.json() : null;
    const declared = manifest?.icons || [];
    const iconFiles = await Promise.all(declared.map(async icon => {
      const response = await fetch(icon.src);
      if (!response.ok) return { src: icon.src, status: response.status };
      const bytes = new Uint8Array(await response.arrayBuffer());
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const signature = Array.from(bytes.slice(0, 8));
      return {
        src: icon.src,
        status: response.status,
        width: view.getUint32(16),
        height: view.getUint32(20),
        signature
      };
    }));
    return {
      manifestStatus: manifestResponse.status,
      display: manifest?.display,
      icons: declared.map(icon => ({ src: icon.src, sizes: icon.sizes, type: icon.type })),
      iconFiles,
      appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || null
    };
  });

  expect(resources.manifestStatus).toBe(200);
  expect(resources.display).toBe('standalone');
  expect(resources.icons).toEqual([
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
  ]);
  expect(resources.iconFiles).toEqual([
    { src: 'icon-192.png', status: 200, width: 192, height: 192, signature: [137, 80, 78, 71, 13, 10, 26, 10] },
    { src: 'icon-512.png', status: 200, width: 512, height: 512, signature: [137, 80, 78, 71, 13, 10, 26, 10] }
  ]);
  expect(resources.appleTouchIcon).toBe('icon-192.png');
});

test('UAT-1995: cabecera y acciones esenciales accesibles a emulación equivalente al 200%', async ({ page }) => {
  await installFixture(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 640,
    height: 360,
    deviceScaleFactor: 2,
    mobile: false
  });
  await expect.poll(() => page.evaluate(() => window.devicePixelRatio)).toBe(2);
  const topbar = page.locator('.topbar');
  const username = page.locator('#topbar-username');
  const logout = page.getByRole('button', { name: 'Salir' });
  await expect(topbar).toBeVisible();
  await expect(username).toBeVisible();
  await expect(logout).toBeVisible();

  const bounds = await page.evaluate(() => {
    const elements = [
      document.querySelector('#topbar-username'),
      document.querySelector('.logout-btn')
    ];
    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      controls: elements.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.x,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          fontSize: parseFloat(getComputedStyle(el).fontSize)
        };
      })
    };
  });
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
  for (const control of bounds.controls) {
    expect(control.x).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(control.width).toBeGreaterThan(0);
    expect(control.height).toBeGreaterThan(0);
    expect(control.fontSize).toBeGreaterThanOrEqual(10);
  }
});

test('UAT-2011, UAT-2044, UAT-2049 y UAT-2052: avisos ADMIN conservan contenido, fecha y semántica de consulta', async ({ page }) => {
  const aviso = {
    id: 'e2e-admin-aviso-consultado',
    titulo: 'Propuesta pendiente',
    mensaje: 'Revisar la hoja de riego de INV 17.',
    fecha: '11/11/2026',
    visto: false,
    leido: false
  };
  const avisoLargo = {
    id: 'e2e-admin-aviso-largo',
    titulo: 'Detalle de revisión',
    mensaje: 'Instrucción extensa: ' + 'comprobar lote, ubicación, responsable y observación; '.repeat(40) + 'FIN DEL AVISO COMPLETO',
    fecha: '09/11/2026',
    visto: false,
    leido: false
  };
  const avisos = [aviso, avisoLargo];
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify({ VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({ VIGUERAS: avisos })
  }, { loginUser: 'VIGUERAS' });

  const bell = page.locator('#topbar-notificaciones');
  const badge = page.locator('#notificaciones-vigueras-badge span[aria-label]');
  await expect(bell).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label', '2 notificaciones sin leer');
  await bell.click();

  const inbox = page.locator('#notificaciones-vigueras-overlay');
  await expect(inbox).toBeVisible();
  const cards = inbox.locator('div[style*="border:1.5px solid var(--border)"]');
  await expect(cards).toHaveCount(2);
  const shortCard = cards.filter({ hasText: aviso.titulo });
  const longCard = cards.filter({ hasText: avisoLargo.titulo });
  await expect(shortCard).toContainText(aviso.mensaje);
  await expect(shortCard).toContainText(aviso.fecha);
  await expect(longCard).toContainText(avisoLargo.mensaje);
  await expect(longCard).toContainText(avisoLargo.fecha);
  await expect(longCard).toContainText('FIN DEL AVISO COMPLETO');
  await expect.poll(() => JSON.parse(database['lasala-avisos-usuario-v1']).VIGUERAS).toEqual([]);
  await expect(badge).toHaveCount(0);
  await inbox.getByRole('button').click();
  await expect(inbox).toBeHidden();
  const avisoWrites = writes
    .filter(write => write.key === 'lasala-avisos-usuario-v1')
    .map(write => JSON.parse(JSON.parse(write.body)));
  expect(avisoWrites).toHaveLength(2);
  expect(avisoWrites[0].VIGUERAS).toHaveLength(2);
  expect(avisoWrites[0].VIGUERAS.every(item => item.visto === true)).toBe(true);
  expect(avisoWrites[0].VIGUERAS.every(item => item.leido === false)).toBe(true);
  expect(avisoWrites[1].VIGUERAS).toEqual([]);
});

test('UAT-2080–2082 y UAT-2088: REGANTE conserva accesos propios y no muestra accesos de administración', async ({ page }) => {
  const { writes } = await installFixture(page, {}, { loginUser: 'REGANTE1' });
  const access = page.locator('#quick-access-block');

  const hojasRiego = access.getByRole('button', { name: /Hojas de riego/ });
  const indiceAbonos = access.getByRole('button', { name: /Índice Abonos/ });
  const especificos = access.getByRole('button', { name: /Específicos/ });
  await expect(hojasRiego).toBeVisible();
  await expect(indiceAbonos).toBeVisible();
  await expect(especificos).toBeVisible();
  for (const shortcut of ['#shortcut-historial', '#shortcut-trabajos', '#shortcut-sala-en-vivo', '#shortcut-clima']) {
    await expect(page.locator(shortcut)).toBeHidden();
  }

  await hojasRiego.click();
  const riego = page.locator('#riego-overlay');
  await expect(riego).toBeVisible();
  await expect(riego).toContainText('Hojas de riego');
  await expect(riego).toContainText('Solo consulta');
  await expect(riego.getByRole('button', { name: /Añadir manualmente|Aplicar/ })).toHaveCount(0);
  await riego.getByRole('button').filter({ hasText: '✕' }).click();
  await expect(riego).toBeHidden();

  await indiceAbonos.click();
  const abonos = page.locator('#indice-abonos-regante-overlay');
  await expect(abonos).toBeVisible();
  await expect(abonos).toContainText('Índice Abonos');
  await expect(page.locator('#tareas-overlay')).toBeHidden();
  await abonos.getByRole('button').first().click();
  await expect(abonos).toBeHidden();

  await especificos.click();
  const especificosOverlay = page.locator('#especificos-regante-overlay');
  await expect(especificosOverlay).toBeVisible();
  await expect(especificosOverlay).toContainText('Específicos');
  await expect(especificosOverlay).toContainText('No hay específicos.');
  await expect(page.locator('#tareas-overlay')).toBeHidden();
  await especificosOverlay.getByRole('button').first().click();
  await expect(especificosOverlay).toBeHidden();

  expect(writes).toEqual([]);
});


test('UAT-2084 y UAT-2096: PEÓN solo ve mantenimiento asignado y no puede reasignar', async ({ page }) => {
  const tickets = [
    {
      id: 'e2e-uat-2084-assigned',
      titulo: 'Mantenimiento asignado UAT-2084',
      descripcion: 'Ticket de prueba asignado a PEON1',
      prioridad: 'normal',
      estado: 'asignado',
      asignados: ['PEON1'],
      creadoEn: '2026-11-11'
    },
    {
      id: 'e2e-uat-2084-other',
      titulo: 'Mantenimiento de otro usuario UAT-2084',
      descripcion: 'No debe aparecer a PEON1',
      prioridad: 'normal',
      estado: 'asignado',
      asignados: ['PEON2'],
      creadoEn: '2026-11-11'
    },
    {
      id: 'e2e-uat-2084-unassigned',
      titulo: 'Mantenimiento sin asignar UAT-2084',
      descripcion: 'No debe aparecer en Mis tareas',
      prioridad: 'normal',
      estado: 'sin_asignar',
      asignados: [],
      creadoEn: '2026-11-11'
    },
    {
      id: 'e2e-uat-2084-closed',
      titulo: 'Mantenimiento cerrado UAT-2084',
      descripcion: 'El histórico cerrado no debe aparecer como pendiente',
      prioridad: 'normal',
      estado: 'cerrado',
      asignados: ['PEON1'],
      creadoEn: '2026-11-11'
    }
  ];
  const { database, writes } = await installFixture(page, {
    'lasala-mantenimiento-v1': JSON.stringify(tickets)
  }, { loginUser: 'PEON1' });

  const access = page.locator('#btn-mantenimiento-peon');
  await expect(access).toBeEnabled();
  await access.click();

  const overlay = page.locator('#mant-peon-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'Mantenimiento de Parcelas' })).toBeVisible();
  await expect(overlay).toContainText('Mantenimiento asignado UAT-2084');
  await expect(overlay.locator('.tarea-card')).toHaveCount(1);
  await expect(overlay).not.toContainText('Mantenimiento de otro usuario UAT-2084');
  await expect(overlay).not.toContainText('Mantenimiento sin asignar UAT-2084');
  await expect(overlay).not.toContainText('Mantenimiento cerrado UAT-2084');
  await expect(overlay.getByRole('button', { name: '▶ Iniciar' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: /asignar|cerrar|archivar/i })).toHaveCount(0);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual(tickets);
  expect(writes).toEqual([]);
});



test('UAT-2097: REGANTE no dispone de gestión de tickets Mantenimiento', async ({ page }) => {
  const { writes } = await installFixture(page, {}, { loginUser: 'REGANTE1' });
  const access = page.locator('#quick-access-block');

  await expect(access).toBeVisible();
  await expect(access.getByRole('button', { name: /Mantenimiento|Tareas|Tickets|Reasignar/i })).toHaveCount(0);
  await expect(page.locator('#btn-mantenimiento-peon')).toBeHidden();
  await expect(page.locator('#mant-peon-overlay')).toBeHidden();
  await expect(page.locator('#tareas-overlay')).toBeHidden();
  expect(writes).toEqual([]);
});






test('UAT-2111–2113: consultar Avisos sin escrituras, cerrar sesión y no heredar la bandeja', async ({ page }) => {
  const users = { E2E_TECH: passwordHash, E2E_TECH2: passwordHash };
  const roles = { E2E_TECH: 'TECNICO', E2E_TECH2: 'TECNICO' };
  const avisoPrivado = {
    id: 'e2e-uat-2113-privado',
    mensaje: 'Aviso privado de la primera sesión UAT-2113',
    fecha: '11/11/2026',
    evaluacion: null,
    observaciones: '',
    leido: true,
    visto: true
  };
  const { writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECH: [avisoPrivado], E2E_TECH2: [] })
  }, { loginUser: 'E2E_TECH' });

  const abrirAvisos = async () => {
    const bell = page.locator('#topbar-avisos');
    await expect(bell).toBeVisible();
    await bell.click();
    const inbox = page.locator('#avisos-tecnico-overlay');
    await expect(inbox).toBeVisible();
    return inbox;
  };
  const cerrarSesion = async () => {
    await page.locator('#avisos-tecnico-overlay').getByTestId('avisos-logout').click();
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#avisos-tecnico-overlay')).toBeHidden();
  };
  const iniciarSesion = async user => {
    await page.locator('#login-user').evaluate((select, value) => {
      if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    }, user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(password);
    await page.locator('#login-btn').click();
    await expect(page.locator('#page-home')).toBeVisible();
  };

  const inbox1 = await abrirAvisos();
  await expect(inbox1).toContainText(avisoPrivado.mensaje);
  await cerrarSesion();
  await iniciarSesion('E2E_TECH2');
  const inbox2 = await abrirAvisos();
  await expect(inbox2).toContainText('No tienes avisos.');
  await expect(inbox2).not.toContainText(avisoPrivado.mensaje);
  await cerrarSesion();
  expect(writes).toEqual([]);
});

test('UAT-2107–2109: Inicio se recalcula al cambiar ADMIN → TÉCNICO → PEÓN', async ({ page }) => {
  const { writes } = await installFixture(page);
  const loginAs = async user => {
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();
    await page.locator('#login-user').evaluate((select, value) => {
      if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    }, user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(password);
    await page.locator('#login-btn').click();
    await expect(page.locator('#page-home')).toBeVisible();
  };

  await expect(page.locator('#quick-access-block')).toBeVisible();
  await expect(page.locator('#shortcut-historial')).toBeVisible();

  await loginAs('E2E_TECH');
  await expect(page.locator('#quick-access-block')).toBeVisible();
  for (const shortcut of ['#shortcut-historial', '#shortcut-trabajos', '#shortcut-sala-en-vivo', '#shortcut-clima']) {
    await expect(page.locator(shortcut)).toBeHidden();
  }
  await expect(page.locator('#topbar-avisos')).toBeVisible();

  await loginAs('PEON1');
  await expect(page.locator('#quick-access-block')).toBeHidden();
  await expect(page.locator('#btn-mantenimiento-peon')).toBeVisible();
  await expect(page.locator('#topbar-avisos')).toBeHidden();
  await expect(page.locator('#shortcut-historial')).toBeHidden();
  expect(writes).toEqual([]);
});

test('UAT-2103–2106: TÉCNICO consulta Archivo y solo ADMIN descarga el respaldo JSON', async ({ page }) => {
  const users = { E2E_ADMIN: passwordHash, E2E_TECH: passwordHash, PEON1: passwordHash, REGANTE1: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', E2E_TECH: 'TECNICO', PEON1: 'PEON', REGANTE1: 'REGANTE' };
  const todayISO = await fechaISOEnNavegador(page);
  const task = {
    id: 'e2e-uat-2103-task',
    titulo: 'Tarea respaldo UAT-2103',
    descripcion: 'Fixture de descarga JSON',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const archivedTask = {
    id: 'e2e-uat-2103-archived',
    titulo: 'Histórico UAT-2103',
    descripcion: 'Consulta de Archivo para TÉCNICO',
    asignadoA: 'PEON1',
    origen: 'manual',
    categoria: 'manual',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    anuladaISO: todayISO,
    motivoAnulacion: 'Fixture',
    estado: 'anulada'
  };
  const ticket = {
    id: 'e2e-uat-2104-ticket',
    titulo: 'Mantenimiento de respaldo UAT-2104',
    prioridad: 'normal',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: todayISO
  };
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    window.__uatBackupBlob = null;
    URL.createObjectURL = blob => {
      window.__uatBackupBlob = blob;
      return createObjectURL(blob);
    };
  });
  const { writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify([task, archivedTask]),
    'lasala-mantenimiento-v1': JSON.stringify([ticket])
  }, { loginUser: 'E2E_ADMIN' });

  await openTasks(page);
  const adminOverlay = page.locator('#tareas-overlay');
  const backup = adminOverlay.getByTestId('tareas-backup-json');
  await expect(backup).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), backup.click()]);
  expect(download.suggestedFilename()).toMatch(/^respaldo-tareas-.*\.json$/);
  const exported = await page.evaluate(async () => JSON.parse(await window.__uatBackupBlob.text()));
  expect(exported.tareas).toEqual([task, archivedTask]);
  expect(exported.mantenimiento).toEqual([ticket]);

  await adminOverlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'E2E_TECH');
  await page.locator('#login-user').selectOption('E2E_TECH');
  await page.locator('#login-pass').fill(password);
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  await openTasks(page);
  const techOverlay = page.locator('#tareas-overlay');
  await expect(techOverlay.getByTestId('tareas-backup-json')).toHaveCount(0);
  await techOverlay.getByRole('button', { name: /Archivo/ }).click();
  await expect(techOverlay.locator('#tareas-archivo-anuladas')).toContainText(archivedTask.titulo);
  await expect(techOverlay.getByTestId('tareas-backup-json')).toHaveCount(0);

  await techOverlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  for (const user of ['PEON1', 'REGANTE1']) {
    await page.locator('#login-user').evaluate((select, value) => {
      if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    }, user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(password);
    await page.locator('#login-btn').click();
    await expect(page.locator('#page-home')).toBeVisible();
    await expect(page.getByTestId('tareas-backup-json')).toHaveCount(0);
    if (user === 'PEON1') {
      await page.getByRole('button', { name: 'Salir' }).click();
      await expect(page.locator('#login-screen')).toBeVisible();
    }
  }
  expect(writes).toEqual([]);
});

test('UAT-2100–2102: la campana de Avisos no aparece para CARGADOR, REGANTE ni PEÓN', async ({ page }) => {
  const users = { E2E_ADMIN: passwordHash, E2E_TECH: passwordHash, JULIO: passwordHash, REGANTE1: passwordHash, PEON1: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', E2E_TECH: 'TECNICO', JULIO: 'CARGADOR', REGANTE1: 'REGANTE', PEON1: 'PEON' };
  const { writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles)
  }, { loginUser: 'JULIO' });

  for (const user of ['JULIO', 'REGANTE1', 'PEON1']) {
    if (user !== 'JULIO') {
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
    await expect(page.locator('#topbar-avisos')).toBeHidden();
  }
  expect(writes).toEqual([]);
});

test('UAT-2098 y UAT-2099: la asignación de Mantenimiento ofrece solo operarios PEÓN', async ({ page }) => {
  const users = {
    E2E_ADMIN: passwordHash,
    E2E_TECH: passwordHash,
    PEON1: passwordHash,
    PEON2: passwordHash,
    REGANTE1: passwordHash
  };
  const roles = {
    E2E_ADMIN: 'ADMIN',
    E2E_TECH: 'TECNICO',
    PEON1: 'PEON',
    PEON2: 'PEON',
    REGANTE1: 'REGANTE'
  };
  const ticket = {
    id: 'e2e-uat-2098-ticket',
    titulo: 'Ticket de asignación UAT-2098',
    descripcion: 'Fixture sin asignar',
    prioridad: 'normal',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: '2026-11-11'
  };
  const { writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-mantenimiento-v1': JSON.stringify([ticket])
  }, { loginUser: 'E2E_ADMIN' });

  for (const user of ['E2E_ADMIN', 'E2E_TECH']) {
    if (user === 'E2E_TECH') {
      await page.locator('#tareas-overlay').getByRole('button', { name: /✕ Cerrar/ }).click();
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
    await overlay.getByRole('button', { name: /Mantenimiento de Parcelas/ }).click();
    const porTicket = await overlay.locator('.mant-persona-chk').evaluateAll(inputs => inputs.map(input => input.value).sort());
    const globales = await overlay.locator('.mant-persona-todas-chk').evaluateAll(inputs => inputs.map(input => input.parentElement.textContent.trim()).sort());
    expect(porTicket).toEqual(['PEON1', 'PEON2']);
    expect(globales).toEqual(['PEON1', 'PEON2']);
  }
  expect(writes).toEqual([]);
});

test('UAT-2085 y UAT-2086: CARGADOR abre QC Carga y solo ve secciones autorizadas', async ({ page }) => {
  const users = {
    E2E_ADMIN: passwordHash,
    E2E_TECH: passwordHash,
    PEON1: passwordHash,
    REGANTE1: passwordHash,
    JULIO: passwordHash
  };
  const roles = {
    E2E_ADMIN: 'ADMIN',
    E2E_TECH: 'TECNICO',
    PEON1: 'PEON',
    REGANTE1: 'REGANTE',
    JULIO: 'CARGADOR'
  };
  const { writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-conteo-tuta-invs-v1': JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ key: String(i).padStart(2, '0'), label: `INV ${String(i).padStart(2, '0')}` }))),
    'lasala-conteo-trips-invs-v1': JSON.stringify([])
  }, { loginUser: 'JULIO' });

  const accesoQc = page.getByTestId('home-qc-carga');
  await expect(accesoQc).toBeVisible();
  await expect(accesoQc).toContainText('QC Carga');
  await accesoQc.click();

  const overlay = page.locator('#control-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Control');
  const secciones = overlay.locator('button[onclick^="seleccionarSeccionControl("]');
  await expect(secciones).toHaveText(['Check Carga Injerto', 'Check Carga Normal']);
  await expect(secciones.filter({ hasText: 'Check Túnel' })).toHaveCount(0);
  await expect(overlay.getByTestId('control-carga-print')).toBeVisible();
  await overlay.getByTestId('control-day-today').click();
  await expect(overlay.getByTestId('control-add-line')).toBeVisible();
  expect(writes).toEqual([]);
});


test('UAT-1245: Tareas no duplica los accesos específicos de Riego', async ({ page }) => {
  const { database, writes } = await installFixture(page);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');

  await expect(overlay.getByRole('button', { name: 'Tareas de hoy' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' })).toBeVisible();
  await expect(overlay.getByText('Índice de Abonos', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText('Hojas de Riego', { exact: true })).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(JSON.parse(database['lasala-mantenimiento-v1'])).toEqual([]);
  expect(writes).toEqual([]);
});


test('UAT-1360–1362: Riego conserva ID y calles, rechaza REGANTE y evita duplicados al volver a la sala', async ({ page }) => {
  const users = { E2E_ADMIN: passwordHash, PEON1: passwordHash, PEON2: passwordHash, REGANTE1: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', PEON1: 'PEON', PEON2: 'PEON', REGANTE1: 'REGANTE' };
  const riego = { '17': { '32': { '2': 'PP + 1º HORA' } } };
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-riego-v1': JSON.stringify(riego)
  });

  const original = await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
    await loadTareasData();
    const task = tareasData.find(item => item.origen === 'riego' && item.inv === '17');
    return task && { id: task.id, asignadoA: task.asignadoA, titulo: task.titulo, fechaISO: task.fechaISO, calles: task.calles };
  });
  expect(original).toBeTruthy();
  const destino = original.asignadoA === 'PEON1' ? 'PEON2' : 'PEON1';

  const reasignar = async destino => page.evaluate(async ({ id, destino }) => {
    await loadTareasData();
    const card = document.createElement('div');
    card.className = 'tarea-card';
    card.dataset.id = id;
    const wrap = document.createElement('div');
    wrap.className = 'tarea-reasignar-wrap';
    const select = document.createElement('select');
    select.setAttribute('data-testid', 'tarea-reasignar-select');
    for (const user of ['PEON1', 'PEON2', 'REGANTE1']) select.add(new Option(user, user));
    select.value = destino;
    wrap.append(select);
    card.append(wrap);
    document.body.append(card);
    await guardarReasignacionTarea(id);
    card.remove();
    return tareasData.find(item => item.id === id);
  }, { id: original.id, destino });

  const manual = await reasignar(destino);
  expect({
    id: manual.id,
    asignadoA: manual.asignadoA,
    titulo: manual.titulo,
    fechaISO: manual.fechaISO,
    calles: manual.calles,
    asignacionManual: manual.asignacionManual
  }).toEqual({ ...original, asignadoA: destino, asignacionManual: true });

  const antesRechazo = writes.length;
  const rechazada = await reasignar('REGANTE1');
  expect(rechazada.asignadoA).toBe(destino);
  expect(writes).toHaveLength(antesRechazo);

  await page.evaluate(async () => {
    await loadRiegoData();
    await generarTareasDesdeRiego();
    await loadTareasData();
  });
  let tareas = JSON.parse(database['lasala-tareas-v1']).filter(item => item.origen === 'riego' && item.inv === '17');
  expect(tareas).toHaveLength(1);
  expect({ id: tareas[0].id, asignadoA: tareas[0].asignadoA, titulo: tareas[0].titulo, fechaISO: tareas[0].fechaISO, calles: tareas[0].calles })
    .toEqual({ ...original, asignadoA: destino });

  const devuelta = await reasignar(original.asignadoA);
  expect(devuelta.asignacionManual).toBe(false);
  await page.evaluate(async () => {
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });
  tareas = JSON.parse(database['lasala-tareas-v1']).filter(item => item.origen === 'riego' && item.inv === '17');
  expect(tareas).toHaveLength(1);
  expect(tareas[0].asignadoA).toBe(original.asignadoA);
  expect(tareas[0].asignacionManual).not.toBe(true);
});


test('UAT-1365–1366: la tarea reasignada sale del operario anterior y aparece al nuevo', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const task = {
    id: 'e2e-uat-1365-riego',
    titulo: 'Riego reasignado UAT-1365',
    asignadoA: 'PEON1',
    asignadoPor: 'E2E_ADMIN',
    origen: 'riego',
    inv: '17',
    calles: 'C/1702',
    fechaISO: todayISO,
    fecha: 'hoy',
    estado: 'pendiente',
    visto: false
  };
  const users = { E2E_ADMIN: passwordHash, PEON1: passwordHash, PEON2: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', PEON1: 'PEON', PEON2: 'PEON' };
  const { database } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify([task])
  });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  const card = pane.locator(`.tarea-card[data-id="${task.id}"]`);
  await card.getByTestId('tarea-reasignar').click();
  await card.getByTestId('tarea-reasignar-select').selectOption('PEON2');
  await card.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => JSON.parse(database['lasala-tareas-v1'])[0].asignadoA).toBe('PEON2');

  await overlay.getByRole('button', { name: /✕ Cerrar/ }).click();
  const loginAs = async user => {
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('#login-screen')).toBeVisible();
    await page.locator('#login-user').evaluate((select, value) => {
      if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
    }, user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(password);
    await page.locator('#login-btn').click();
    await expect(page.locator('#page-home')).toBeVisible();
  };

  await loginAs('PEON1');
  await expect(page.locator('#peon-tareas-inline')).not.toContainText(task.titulo);
  await loginAs('PEON2');
  await expect(page.locator('#peon-tareas-inline')).toContainText(task.titulo);
  expect(JSON.parse(database['lasala-tareas-v1'])).toHaveLength(1);
});


test('UAT-1368–1369: el lote selecciona varias manuales y excluye Riego', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [
    { id: 'e2e-uat-1368-manual-1', titulo: 'Manual 1 UAT-1368', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '17', calles: '1', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1368-manual-2', titulo: 'Manual 2 UAT-1368', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '17', calles: '2', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1369-riego', titulo: 'Riego protegido UAT-1369', asignadoA: 'PEON1', origen: 'riego', categoria: 'riego', inv: '17', calles: '3', fechaISO: todayISO, estado: 'pendiente' }
  ];
  const users = { E2E_ADMIN: passwordHash, PEON1: passwordHash, PEON2: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', PEON1: 'PEON', PEON2: 'PEON' };
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify(tasks)
  });

  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  const pane = overlay.locator('#tareas-gestor-content-wrap');
  const manual1 = pane.locator('.tarea-card[data-id="e2e-uat-1368-manual-1"] .tarea-select-chk');
  const manual2 = pane.locator('.tarea-card[data-id="e2e-uat-1368-manual-2"] .tarea-select-chk');
  const riegoCard = pane.locator('.tarea-card[data-id="e2e-uat-1369-riego"]');

  await expect(manual1).toBeVisible();
  await expect(manual2).toBeVisible();
  await expect(riegoCard.locator('.tarea-select-chk')).toHaveCount(0);
  await manual1.check();
  await manual2.check();
  await expect(pane.locator('#lote-contador')).toHaveText('2');
  await expect(pane.locator('#btn-asignar-lote')).toBeEnabled();

  await manual1.uncheck();
  await manual2.uncheck();
  await pane.locator('#lote-asignado-select').selectOption('PEON2');
  await page.evaluate(async id => {
    tareasSeleccionadas.add(id);
    await asignarTareasEnLote();
  }, 'e2e-uat-1369-riego');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual(tasks);
  expect(writes).toEqual([]);
});


test('UAT-1370–1374: asignación en lote actualiza solo pendientes, permite REGANTE y persiste al refrescar', async ({ page }) => {
  const todayISO = await fechaISOEnNavegador(page);
  const tasks = [
    { id: 'e2e-uat-1370-manual-1', titulo: 'Manual 1 UAT-1370', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '17', calles: '1', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1370-manual-2', titulo: 'Manual 2 UAT-1370', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '17', calles: '2', fechaISO: todayISO, estado: 'pendiente' },
    { id: 'e2e-uat-1372-started', titulo: 'Manual iniciada UAT-1372', asignadoA: 'PEON1', origen: 'manual', categoria: 'manual', inv: '17', calles: '3', fechaISO: todayISO, estado: 'iniciada' }
  ];
  const users = { E2E_ADMIN: passwordHash, PEON1: passwordHash, PEON2: passwordHash, REGANTE1: passwordHash };
  const roles = { E2E_ADMIN: 'ADMIN', PEON1: 'PEON', PEON2: 'PEON', REGANTE1: 'REGANTE' };
  const { database, writes } = await installFixture(page, {
    'lasala-users-v1': JSON.stringify(users),
    'lasala-roles-v1': JSON.stringify(roles),
    'lasala-tareas-v1': JSON.stringify(tasks)
  });

  const openToday = async () => {
    const existing = page.locator('#tareas-overlay');
    if (await existing.isVisible()) await existing.getByRole('button', { name: /✕ Cerrar/ }).click();
    await openTasks(page);
    const overlay = page.locator('#tareas-overlay');
    await overlay.getByRole('button', { name: 'Tareas de hoy' }).click();
    return overlay.locator('#tareas-gestor-content-wrap');
  };
  let pane = await openToday();
  const row = id => pane.locator(`.tarea-card[data-id="${id}"]`);
  const one = row('e2e-uat-1370-manual-1').locator('.tarea-select-chk');
  const two = row('e2e-uat-1370-manual-2').locator('.tarea-select-chk');
  await expect(row('e2e-uat-1372-started').locator('.tarea-select-chk')).toHaveCount(0);

  await one.check();
  await two.check();
  await pane.locator('#lote-asignado-select').selectOption('PEON2');
  await pane.locator('#btn-asignar-lote').click();
  await expect.poll(() => JSON.parse(database['lasala-tareas-v1']).filter(t => t.estado === 'pendiente').map(t => t.asignadoA))
    .toEqual(['PEON2', 'PEON2']);
  expect(JSON.parse(database['lasala-tareas-v1']).map(t => t.id)).toEqual(tasks.map(t => t.id));

  pane = await openToday();
  await row('e2e-uat-1370-manual-1').locator('.tarea-select-chk').check();
  await row('e2e-uat-1370-manual-2').locator('.tarea-select-chk').check();
  await pane.locator('#lote-asignado-select').selectOption('REGANTE1');
  await pane.locator('#btn-asignar-lote').click();
  await expect.poll(() => JSON.parse(database['lasala-tareas-v1']).filter(t => t.estado === 'pendiente').map(t => t.asignadoA))
    .toEqual(['REGANTE1', 'REGANTE1']);
  const writesBeforeCancel = writes.filter(write => write.key === 'lasala-tareas-v1').length;

  pane = await openToday();
  const pendingSelection = row('e2e-uat-1370-manual-1').locator('.tarea-select-chk');
  await pendingSelection.check();
  await pendingSelection.uncheck();
  await expect(pane.locator('#btn-asignar-lote')).toBeDisabled();
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(writesBeforeCancel);

  await page.reload();
  await expect(page.locator('#page-home')).toBeVisible();
  pane = await openToday();
  await expect(row('e2e-uat-1370-manual-1')).toContainText('REGANTE1');
  await expect(row('e2e-uat-1370-manual-2')).toContainText('REGANTE1');
  expect(JSON.parse(database['lasala-tareas-v1'])).toHaveLength(3);
});


test('UAT-1380–1384: Generar tareas asigna PEÓN por sala y agrupa calles contiguas', async ({ page }) => {
  const riego = {
    '1A': { '32': { '2': 'PP', '3': 'PP', '4': '10' } },
    '17': { '32': { '2': 'PP', '3': '10' } },
    '31': { '32': { '2': 'PP', '3': '10' } }
  };
  const { database, writes } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });
  const tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego');
  expect(tareas).toHaveLength(3);
  const tareaPorInv = Object.fromEntries(tareas.map(t => [t.inv, t]));
  expect(tareaPorInv['1A'].asignadoA).toBe('PEON1');
  expect(tareaPorInv['17'].asignadoA).toBe('PEON2');
  expect(tareaPorInv['31'].asignadoA).toBe('PEON3');
  expect(tareaPorInv['1A'].calles).toBe('C/102-103');
  expect(tareaPorInv['17'].calles).toBe('C/1702');
  expect(tareaPorInv['31'].calles).toBe('C/3102');
  const tarjeta = await page.evaluate(task => buildTareaGestorRow(task, false), tareaPorInv['1A']);
  expect(tarjeta).toContain('INV 1A');
  expect(tarjeta).toContain('C/102-103');
  expect(writes.filter(write => write.key === 'lasala-tareas-v1')).toHaveLength(1);
});


test('UAT-1385: dos trabajos distintos del mismo invernadero y día generan órdenes separadas', async ({ page }) => {
  const riego = {
    '1A': { '32': { '2': 'PP', '3': '10', '4': 'PA' } }
  };
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });

  const tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego' && t.inv === '1A');
  expect(tareas).toHaveLength(2);
  expect(new Set(tareas.map(t => t.titulo))).toEqual(new Set(['Puntas de pasillo', 'Puntas de atrás']));
  expect(new Set(tareas.map(t => t.id)).size).toBe(2);
});


test('UAT-1390–1392: conciliar Riego conserva tareas manuales, Pistola y Específicos', async ({ page }) => {
  const riego = { '1A': { '32': { '2': 'PP' } } };
  const previas = [
    { id: 'e2e-manual-1390', titulo: 'Puntas de pasillo', origen: 'manual', asignadoA: 'PEON1', inv: '1A', calles: 'C/102', estado: 'pendiente' },
    { id: 'e2e-pistola-1391', titulo: 'Pistola', origen: 'pistola', categoria: 'pistola', asignadoA: 'PEON1', inv: '1A', estado: 'pendiente' },
    { id: 'e2e-especificos-1392', titulo: 'Específicos', origen: 'especificos', categoria: 'especificos', asignadoA: 'PEON1', inv: '1A', estado: 'pendiente' }
  ];
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego),
    'lasala-tareas-v1': JSON.stringify(previas)
  });

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });

  const tareas = JSON.parse(database['lasala-tareas-v1']);
  for (const previa of previas) expect(tareas.find(t => t.id === previa.id)).toEqual(previa);
  expect(tareas.filter(t => t.origen === 'riego' && t.inv === '1A')).toHaveLength(1);
  expect(tareas).toHaveLength(4);
});


test('UAT-1393 y 1395: regenerar tareas conserva una ejecución iniciada y otra completada', async ({ page }) => {
  const riego = {
    '1A': { '32': { '2': 'PP' } },
    '17': { '32': { '2': 'PP' } }
  };
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });
  const fechaISO = await page.evaluate(() => fechaLocalISO(riegoDiaToDate(32)));
  const previas = [
    { id: 'e2e-started-1393', titulo: 'Puntas de pasillo', asignadoA: 'PEON1', origen: 'riego', inv: '1A', calles: 'C/102', callesOrigenRiego: [2], fechaISO, estado: 'iniciada', horaInicio: '09:00', firmante: 'PEON1' },
    { id: 'e2e-completed-1395', titulo: 'Puntas de pasillo', asignadoA: 'PEON2', origen: 'riego', inv: '17', calles: 'C/1702', callesOrigenRiego: [2], fechaISO, estado: 'completada', horaInicio: '09:00', horaFin: '10:00', firmante: 'PEON2' }
  ];
  database['lasala-tareas-v1'] = JSON.stringify(previas);

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });

  const tareas = JSON.parse(database['lasala-tareas-v1']);
  for (const previa of previas) expect(tareas.find(t => t.id === previa.id)).toEqual(previa);
  expect(tareas).toHaveLength(2);
});


test('UAT-1397–1398: conciliar calles nuevas conserva la reasignación manual', async ({ page }) => {
  const riego = { '17': { '32': { '3': 'PP' } } };
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });
  const fechaISO = await page.evaluate(() => fechaLocalISO(riegoDiaToDate(32)));
  const manual = {
    id: 'e2e-manual-riego-1397',
    titulo: 'Puntas de pasillo',
    asignadoA: 'PEON1',
    origen: 'riego',
    inv: '17',
    calles: 'C/1702',
    fechaISO,
    estado: 'pendiente',
    asignacionManual: true
  };
  database['lasala-tareas-v1'] = JSON.stringify([manual]);

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });
  let tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego' && t.inv === '17');
  expect(tareas).toHaveLength(1);
  let tarea = tareas[0];
  expect(tarea.id).toBe(manual.id);
  expect(tarea.asignadoA).toBe('PEON1');
  expect(tarea.calles).toBe('C/1703');
  expect(tarea.callesOrigenRiego).toEqual([3]);

  await page.evaluate(async () => {
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });
  tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego' && t.inv === '17');
  expect(tareas).toHaveLength(1);
  tarea = tareas[0];
  expect({ id: tarea.id, asignadoA: tarea.asignadoA, calles: tarea.calles, asignacionManual: tarea.asignacionManual, callesOrigenRiego: tarea.callesOrigenRiego })
    .toEqual({ id: manual.id, asignadoA: 'PEON1', calles: 'C/1703', asignacionManual: true, callesOrigenRiego: [3] });
});


test('UAT-1400: varios tramos del mismo trabajo se normalizan sin calles duplicadas', async ({ page }) => {
  const riego = {
    '1A': { '32': { '2': 'PP', '3': '10', '4': 'PP', '5': '10', '6': 'PP' } }
  };
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });

  await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });

  const tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego' && t.inv === '1A');
  expect(tareas).toHaveLength(1);
  expect(tareas[0].calles).toBe('C/102, C/104, C/106');
  expect(tareas[0].callesOrigenRiego).toEqual([2, 4, 6]);
});


test('UAT-1401: repetir conciliación sin cambios conserva la tarea Riego existente', async ({ page }) => {
  test.fail(true, 'La acción explícita «Generar tareas» reconstruye las órdenes pendientes en vez de conciliarlas de forma idempotente.');
  const riego = { '1A': { '32': { '2': 'PP' } } };
  const { database } = await installFixture(page, {
    'lasala-riego-v1': JSON.stringify(riego)
  });

  const primeraId = await page.evaluate(async () => {
    window.confirm = () => true;
    await loadRiegoData();
    await generarTareasDesdeRiego();
    return JSON.parse(await window.storage.get('lasala-tareas-v1')).find(t => t.origen === 'riego')?.id;
  });
  await page.evaluate(async () => {
    await loadRiegoData();
    await generarTareasDesdeRiego();
  });

  const tareas = JSON.parse(database['lasala-tareas-v1']).filter(t => t.origen === 'riego');
  expect(tareas).toHaveLength(1);
  expect(tareas[0].id).toBe(primeraId);
});
