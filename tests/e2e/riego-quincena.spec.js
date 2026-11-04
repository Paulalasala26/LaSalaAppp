const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

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

function riegoGuardado(database) {
  const raw = database['lasala-riego-v1'];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function textoGuardadoRiego(database, invId, day, street) {
  const value = riegoGuardado(database)?.[invId]?.[day]?.[street];
  return value && typeof value === 'object' ? value.texto : value;
}

async function openRiego(page, database, { writeDelayMs = 0 } = {}) {
  const unexpectedHosts = [];
  const writes = [];
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
    writes.push({ method: request.method(), path: path.join('/'), body });
    if (writeDelayMs) await new Promise(resolve => setTimeout(resolve, writeDelayMs));
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
  return { overlay, database, unexpectedHosts, writes };
}

async function openManualRiegoOnFutureDay(page) {
  const grid = page.locator('#riego-grid-wrap');
  const day = await grid.locator('input[data-rinv="17"][readonly]').evaluateAll(elements =>
    elements.find(element => Number(element.dataset.dia) > 31)?.dataset.dia
  );
  expect(day).toBeTruthy();
  const row = grid.locator(`tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
  await row.locator('td').first().click();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  return { form, grid, day: await form.locator('#rm-dia').inputValue() };
}

async function callesVisiblesDelDia(grid, day) {
  return grid.locator(`input[data-rinv="17"][data-dia="${day}"]`).evaluateAll(elements =>
    [...new Set(elements.flatMap(element => element.dataset.rc.split(',').map(Number)))].sort((a,b) => a-b)
  );
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

test('UAT-101 y UAT-102: una celda histórica ocupada abre consulta de solo lectura', async ({ page }) => {
  const database = fixtureDatabase();
  const before = database['lasala-riego-v1'];
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database);
  const celda = page.locator('#riego-grid-wrap td[ondblclick*="editarRiegoManualDesdeCelda"]').filter({ hasText: 'E2E-RIEGO-DIA-29' });
  await celda.click();

  const consulta = page.locator('#riego-consulta-overlay');
  await expect(consulta).toBeVisible();
  await expect(consulta.getByRole('heading', { name: 'Consultar riego' })).toBeVisible();
  await expect(consulta.getByTestId('riego-consulta-fecha')).toContainText('29 jun');
  await expect(consulta.getByTestId('riego-consulta-texto')).toHaveText('E2E-RIEGO-DIA-29');
  await expect(consulta.locator('#rm-dia, .rm-agua-min, #rm-guardar-btn, [data-testid="riego-consulta-delete"]')).toHaveCount(0);
  await expect(consulta.getByRole('button')).toHaveCount(1);
  await consulta.getByRole('button', { name: 'Cerrar consulta' }).click();
  await expect(consulta).toBeHidden();
  expect(database['lasala-riego-v1']).toBe(before);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-103: una celda histórica vacía no ofrece alta retroactiva', async ({ page }) => {
  const database = fixtureDatabase();
  const before = database['lasala-riego-v1'];
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database);
  const filaHistorica = page.locator('#riego-grid-wrap tr').filter({ hasText: '29 jun' }).first();
  await filaHistorica.locator('td').last().click();

  await expect(page.locator('#riego-manual-overlay')).toBeHidden();
  await expect(page.locator('#riego-consulta-overlay')).toBeHidden();
  expect(database['lasala-riego-v1']).toBe(before);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
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

test('UAT-076: la cuadrícula de Riego no permite edición directa de celdas', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const grid = page.locator('#riego-grid-wrap');

  await expect(grid.locator('input[data-rinv="17"]:not([readonly]), textarea[data-rinv="17"]:not([readonly])')).toHaveCount(0);
  await expect(grid.locator('input[data-rinv="17"][data-dia="30"]').first()).toHaveAttribute('readonly', '');
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-077: arrastrar por calles abre un único formulario con el tramo seleccionado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const grid = page.locator('#riego-grid-wrap');
  const futureDay = await grid.locator('input[data-rinv="17"][readonly]').evaluateAll(elements =>
    elements.find(element => Number(element.dataset.dia) > 31)?.dataset.dia
  );
  expect(futureDay).toBeTruthy();
  const first = grid.locator(`input[data-rinv="17"][data-dia="${futureDay}"]`).first();
  const second = grid.locator(`input[data-rinv="17"][data-dia="${futureDay}"]`).nth(1);
  const firstStreet = Number(await first.getAttribute('data-rc'));
  const secondStreet = Number(await second.getAttribute('data-rc'));
  const low = Math.min(firstStreet, secondStreet);
  const high = Math.max(firstStreet, secondStreet);

  await first.hover();
  await page.mouse.down();
  await second.hover();
  await page.mouse.up();

  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="rmb-modo-17"]').nth(2)).toBeChecked();
  await expect(form.locator('.rmb-tramo-desde').first()).toHaveValue(String(low));
  await expect(form.locator('.rmb-tramo-hasta').first()).toHaveValue(String(high));
  await expect(page.locator('#riego-manual-overlay')).toHaveCount(1);
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-078: el selector de Riego permite recorrer las cinco salas y sus invernaderos', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);

  await page.locator('#riego-inv-selector-toggle').click();
  const selector = page.locator('#riego-inv-selector-wrap');
  await expect(selector).toBeVisible();
  for (let sala = 1; sala <= 5; sala++) await expect(selector).toContainText(`SALA ${sala}:`);
  expect(await selector.locator('button[data-rinv]').count()).toBeGreaterThan(0);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-079 y UAT-080: la selección múltiple conserva salas y no duplica al seleccionar una sala completa', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);

  await page.locator('#riego-grid-wrap').getByText('1 jul', { exact: true }).first().click();
  const form = page.locator('#riego-manual-overlay');
  const sala1 = form.locator('.rmb-inv-chk[data-sala="sala1"]');
  const sala2 = form.locator('.rmb-inv-chk[data-sala="sala2"]');
  for (const selected of await form.locator('.rmb-inv-chk:checked').all()) await selected.uncheck();
  const selectedSala1 = sala1.first();
  const selectedSala2 = sala2.first();
  await selectedSala1.check();
  await selectedSala2.check();
  const selectedSala2Id = await selectedSala2.getAttribute('value');
  await expect(selectedSala1).toBeChecked();
  await expect(selectedSala2).toBeChecked();
  await expect(form.locator('.rmb-inv-chk:checked')).toHaveCount(2);

  await selectedSala1.uncheck();
  await form.locator('.rmb-sala-chk[data-sala="sala1"]').check();
  expect(await sala1.evaluateAll(elements => elements.every(element => element.checked))).toBe(true);
  await expect(form.locator(`.rmb-inv-chk[data-sala="sala2"][value="${selectedSala2Id}"]`)).toBeChecked();
  const sala1Count = await sala1.count();
  const selectedCount = await form.locator('.rmb-inv-chk:checked').count();
  expect(selectedCount).toBe(sala1Count + 1);
  await expect(overlay).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-081: limpiar una sala no elimina las selecciones de otras salas ni modifica riegos', async ({ page }) => {
  const database = fixtureDatabase();
  const before = JSON.stringify(database['lasala-riego-v1']);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  await page.locator('#riego-grid-wrap').getByText('1 jul', { exact: true }).first().click();
  const form = page.locator('#riego-manual-overlay');
  const sala1 = form.locator('.rmb-inv-chk[data-sala="sala1"]');
  const sala2 = form.locator('.rmb-inv-chk[data-sala="sala2"]');
  for (const selected of await form.locator('.rmb-inv-chk:checked').all()) await selected.uncheck();
  const keepSala2 = sala2.first();
  await keepSala2.check();
  await form.locator('.rmb-sala-chk[data-sala="sala1"]').check();
  await form.locator('.rmb-sala-chk[data-sala="sala1"]').uncheck();

  expect(await sala1.evaluateAll(elements => elements.every(element => !element.checked))).toBe(true);
  await expect(keepSala2).toBeChecked();
  await expect(form.locator('.rmb-inv-chk:checked')).toHaveCount(1);
  expect(JSON.stringify(database['lasala-riego-v1'])).toBe(before);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-082: quitar un invernadero de la lista agrupada actualiza solo esa selección y el contador', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  await page.locator('#riego-grid-wrap').getByText('1 jul', { exact: true }).first().click();
  const form = page.locator('#riego-manual-overlay');
  const selected = form.getByTestId('riego-invernaderos-seleccionados');
  await expect(selected).toContainText('Seleccionados (1)');
  await expect(selected).toContainText('Sala 2:');
  await expect(selected).toContainText('INV 17');

  const secondRoomInv = form.locator('.rmb-inv-chk[data-sala="sala2"]').first();
  const secondId = await secondRoomInv.getAttribute('value');
  await secondRoomInv.check();
  await expect(selected).toContainText('Seleccionados (2)');
  await expect(selected).toContainText('Sala 2:');
  await selected.getByTestId('riego-quitar-inv-17').click();

  await expect(selected).toContainText('Seleccionados (1)');
  await expect(selected).not.toContainText('INV 17');
  await expect(selected).toContainText(`INV ${secondId}`);
  await expect(form.locator('.rmb-inv-chk[value="17"]')).not.toBeChecked();
  await expect(form.locator(`.rmb-inv-chk[value="${secondId}"]`)).toBeChecked();
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-087: los tramos configurados en dos salas sobreviven al actualizar la selección', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  await openManualRiegoOnFutureDay(page);
  const form = page.locator('#riego-manual-overlay');
  const secondRoomInv = form.locator('.rmb-inv-chk[data-sala="sala2"]').first();
  await secondRoomInv.check();
  const secondInvId = await secondRoomInv.getAttribute('value');
  const config = {};

  for (const [invId, fromIndex, toIndex] of [['17', 1, 3], [secondInvId, 2, 4]]) {
    await form.locator(`input[name="rmb-modo-${invId}"]`).nth(2).check();
    const selects = form.locator(`#rmb-detalle-${invId} .rmb-tramo-row select`);
    const from = await selects.first().locator('option').nth(fromIndex).getAttribute('value');
    const to = await selects.first().locator('option').nth(toIndex).getAttribute('value');
    await selects.first().selectOption(from);
    await selects.nth(1).selectOption(to);
    config[invId] = { from, to };
  }

  await form.locator('.rmb-inv-chk[data-sala="sala3"]').first().check();
  for (const [invId, { from, to }] of Object.entries(config)) {
    await expect(form.locator(`input[name="rmb-modo-${invId}"]`).nth(2)).toBeChecked();
    const selects = form.locator(`#rmb-detalle-${invId} .rmb-tramo-row select`);
    await expect(selects.first()).toHaveValue(from);
    await expect(selects.nth(1)).toHaveValue(to);
  }
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-083, UAT-088 y UAT-112: Entero guarda la instrucción completa y agua ordinaria no crea tareas', async ({ page }) => {
  const database = fixtureDatabase();
  const tasksBefore = JSON.stringify(database['lasala-tareas-v1'] ?? null);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  await expect(form.locator('input[name="rmb-modo-17"]').first()).toBeChecked();
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);

  const saved = riegoGuardado(database)['17'][day];
  expect(Object.keys(saved).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(Object.values(saved).every(value => JSON.stringify(value).includes('10')), JSON.stringify(saved)).toBe(true);
  expect(JSON.stringify(database['lasala-tareas-v1'] ?? null)).toBe(tasksBefore);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-084: Entero menos respeta el tramo excluido sin afectar otras calles', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  await form.locator('input[name="rmb-modo-17"]').nth(1).check();
  const excludes = form.locator('#rmb-detalle-17 select');
  const firstExcluded = await excludes.first().locator('option').nth(1).getAttribute('value');
  const lastExcluded = await excludes.first().locator('option').nth(3).getAttribute('value');
  await excludes.first().selectOption(firstExcluded);
  await excludes.nth(1).selectOption(lastExcluded);
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  const expected = streets.filter(street => street < Number(firstExcluded) || street > Number(lastExcluded));
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(expected.length);
  expect(Object.keys(riegoGuardado(database)['17'][day]).map(Number).sort((a,b) => a-b)).toEqual(expected);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-085: el modo Tramo de calles aplica solo el rango elegido', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  await form.locator('input[name="rmb-modo-17"]').nth(2).check();
  const tramo = form.locator('#rmb-detalle-17 .rmb-tramo-row select');
  const from = await tramo.first().locator('option').nth(1).getAttribute('value');
  const to = await tramo.first().locator('option').nth(3).getAttribute('value');
  await tramo.first().selectOption(from);
  await tramo.nth(1).selectOption(to);
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  const allStreets = await callesVisiblesDelDia(grid, day);
  const expected = allStreets.filter(street => street >= Number(from) && street <= Number(to));
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(expected.length);
  expect(Object.keys(riegoGuardado(database)['17'][day]).map(Number).sort((a,b) => a-b)).toEqual(expected);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-086: un tramo invertido bloquea el guardado y explica cómo corregirlo', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form } = await openManualRiegoOnFutureDay(page);
  const before = JSON.stringify(database['lasala-riego-v1']);
  await form.locator('input[name="rmb-modo-17"]').nth(2).check();
  const tramo = form.locator('#rmb-detalle-17 .rmb-tramo-row select');
  const last = await tramo.first().locator('option').last().getAttribute('value');
  const first = await tramo.first().locator('option').first().getAttribute('value');
  await tramo.first().selectOption(last);
  await tramo.nth(1).selectOption(first);
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();

  await expect(form).toBeVisible();
  await expect(page.locator('#app-toast')).toContainText('tramo de calles de INV 17 es inválido');
  expect(JSON.stringify(database['lasala-riego-v1'])).toBe(before);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-089: la instrucción adicional se guarda junto con la programación de Riego', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  const note = 'E2E instrucción adicional para el mismo riego';
  await form.locator('.rm-agua-min').first().selectOption('20');
  await form.getByRole('button', { name: '* Nota' }).click();
  const postit = page.locator('#riego-postit-overlay');
  await postit.locator('#rm-postit-texto').fill(note);
  await postit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();

  const saved = riegoGuardado(database)['17'][day];
  expect(Object.keys(saved).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(Object.values(saved).every(value => JSON.stringify(value).includes(`20 + * ${note}`))).toBe(true);
  const renderedCells = await grid.locator(`input[data-rinv="17"][data-dia="${day}"], textarea[data-rinv="17"][data-dia="${day}"]`)
    .evaluateAll(elements => elements.map(element => element.value || element.textContent || ''));
  expect(renderedCells.some(value => value.includes(`20 + * ${note}`))).toBe(true);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-093: Aplicar guarda desde el formulario y deja accesible la acción de guardar de la cuadrícula', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);

  await expect(form.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0);
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect(overlay.locator('button[title="Guardar"]')).toBeVisible();
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);
  expect(Object.values(riegoGuardado(database)['17'][day]).every(value => JSON.stringify(value).includes('10'))).toBe(true);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-094: un riego aplicado reaparece en el mismo invernadero y calle al volver a entrar', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  await form.locator('.rm-agua-min').first().selectOption('20');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);

  await overlay.getByRole('button', { name: '✕', exact: true }).click();
  await expect(page.locator('#page-home')).toBeVisible();
  await page.locator('.home-shortcut-card[onclick="handleQuickAction(\'riego\')"]').click();
  await expect(overlay).toBeVisible();
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="17"]').click();
  await expect(grid).toContainText('20');
  expect(Object.keys(riegoGuardado(database)['17'][day]).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(riegoGuardado(database)['18']['30']['2']).toBe('E2E-RIEGO-INV-18');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-095: un riego aplicado reaparece idéntico después de recargar la aplicación', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  await form.locator('.rm-agua-min').first().selectOption('30');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => JSON.stringify(riegoGuardado(database)?.['17']?.[day]?.['2'] ?? '')).toContain('30');
  const saved = JSON.stringify(riegoGuardado(database)['17'][day]);

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('.home-shortcut-card[onclick="handleQuickAction(\'riego\')"]').click();
  await expect(overlay).toBeVisible();
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="17"]').click();
  await expect(grid).toContainText('30');
  expect(JSON.stringify(riegoGuardado(database)['17'][day])).toBe(saved);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-096: editar el agua de un riego conserva el Trabajo y el horario existentes', async ({ page }) => {
  const database = fixtureDatabase();
  const seeded = JSON.parse(database['lasala-riego-v1']);
  seeded['17']['32'] = { '2': '10 + PP + 1º HORA' };
  database['lasala-riego-v1'] = JSON.stringify(seeded);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const cell = page.locator(`#riego-grid-wrap textarea[ondblclick*="'17',32"]`);
  await expect(cell).toHaveValue('10 + PP + 1º HORA');
  await cell.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('.rm-agua-min').first()).toHaveValue('10');
  await expect(form.locator('.rm-trabajo-chk[value="PP"]').first()).toBeChecked();
  await expect(form.locator('#rm-horario-trabajo')).toHaveValue('1º HORA');
  await form.locator('.rm-agua-min').first().selectOption('20');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => {
    const saved = riegoGuardado(database)?.['17']?.['32']?.['2'];
    return typeof saved === 'object' ? saved.texto : saved;
  }).toBe('PP + 1º HORA + 20');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-097: guardar un riego antiguo sin cambios conserva todo el texto no reconocido', async ({ page }) => {
  const database = fixtureDatabase();
  const seeded = JSON.parse(database['lasala-riego-v1']);
  seeded['17']['32'] = { '2': '10 + FORMATO-ANTIGUO' };
  database['lasala-riego-v1'] = JSON.stringify(seeded);
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const cell = page.locator(`#riego-grid-wrap textarea[ondblclick*="'17',32"]`);
  await expect(cell).toHaveValue('10 + FORMATO-ANTIGUO');
  await cell.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('.rm-agua-min').first()).toHaveValue('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => textoGuardadoRiego(database, '17', '32', '2')).toBe('10 + FORMATO-ANTIGUO');
  expect(dialogs).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-098: cambiar un riego histórico no reconstruible avisa y cancelar conserva el original', async ({ page }) => {
  const database = fixtureDatabase();
  const seeded = JSON.parse(database['lasala-riego-v1']);
  seeded['17']['32'] = { '2': '10 + FORMATO-ANTIGUO' };
  database['lasala-riego-v1'] = JSON.stringify(seeded);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const cell = page.locator(`#riego-grid-wrap textarea[ondblclick*="'17',32"]`);
  await cell.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  const dialogs = [];
  page.once('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await form.locator('.rm-agua-min').first().selectOption('20');
  await form.locator('#rm-guardar-btn').click();

  await expect(form).toBeVisible();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('texto antiguo que los selectores no reconocen');
  expect(textoGuardadoRiego(database, '17', '32', '2')).toBe('10 + FORMATO-ANTIGUO');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-099: guardar varios invernaderos y tramos solo modifica los destinos seleccionados', async ({ page }) => {
  const database = fixtureDatabase();
  const originalInv17 = JSON.stringify(JSON.parse(database['lasala-riego-v1'])['17']['30']);
  const originalInv18 = JSON.stringify(JSON.parse(database['lasala-riego-v1'])['18']['30']);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const secondRoomInv = form.locator('.rmb-inv-chk[data-sala="sala2"]:not(:checked)').first();
  const secondId = await secondRoomInv.getAttribute('value');
  await secondRoomInv.check();
  const ranges = {};

  for (const invId of ['17', secondId]) {
    await form.locator(`input[name="rmb-modo-${invId}"]`).nth(2).check();
    const selects = form.locator(`#rmb-detalle-${invId} .rmb-tramo-row select`);
    const options = await selects.first().locator('option').evaluateAll(elements => elements.map(el => Number(el.value)));
    const from = options[1], to = options[3];
    await selects.first().selectOption(String(from));
    await selects.nth(1).selectOption(String(to));
    ranges[invId] = options.filter(street => street >= from && street <= to);
  }
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();

  for (const [invId, expected] of Object.entries(ranges)) {
    await expect.poll(() => Object.keys(riegoGuardado(database)?.[invId]?.[day] || {}).length).toBe(expected.length);
    expect(Object.keys(riegoGuardado(database)[invId][day]).map(Number).sort((a,b) => a-b)).toEqual(expected);
    expect(Object.values(riegoGuardado(database)[invId][day]).every(value => JSON.stringify(value).includes('10'))).toBe(true);
  }
  expect(JSON.stringify(riegoGuardado(database)['17']['30'])).toBe(originalInv17);
  expect(JSON.stringify(riegoGuardado(database)['18']['30'])).toBe(originalInv18);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-100: varios clics rápidos en Aplicar producen un único guardado confirmado', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database, { writeDelayMs: 250 });
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  await form.locator('.rm-agua-min').first().selectOption('30');
  const button = form.locator('#rm-guardar-btn');
  await button.evaluate(element => { element.click(); element.click(); element.click(); });

  await expect(form).toBeHidden();
  await expect.poll(() => writes.filter(write => write.path === 'lasala-riego-v1' && write.method !== 'GET').length).toBe(1);
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);
  expect(Object.keys(riegoGuardado(database)['17'][day]).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(Object.values(riegoGuardado(database)['17'][day]).every(value => JSON.stringify(value).includes('30'))).toBe(true);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-090 y UAT-091: la nota sin Trabajo conserva literalmente tildes, signos y texto largo', async ({ page }) => {
  const database = fixtureDatabase();
  const tasksBefore = JSON.stringify(database['lasala-tareas-v1'] ?? null);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  const note = 'E2E nota larga: áéíóú ñ ü ¿¡ + / ; : (comprobación literal) — 1234567890';
  await form.getByRole('button', { name: '* Nota' }).click();
  const postit = page.locator('#riego-postit-overlay');
  await postit.locator('#rm-postit-texto').fill(note);
  await postit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();

  const saved = riegoGuardado(database)['17'][day];
  expect(Object.keys(saved).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(Object.values(saved).every(value => JSON.stringify(value).includes(`* ${note}`))).toBe(true);
  await grid.locator('td[title="Pulsa para ver la nota"]').first().click();
  await expect(page.locator('#app-toast')).toContainText(note);
  expect(JSON.stringify(database['lasala-tareas-v1'] ?? null)).toBe(tasksBefore);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-073: la cuadrícula y sus acciones siguen utilizables en móvil vertical y horizontal', async ({ page }) => {
  const database = fixtureDatabase();
  await page.setViewportSize({ width: 390, height: 844 });
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const grid = page.locator('#riego-grid-wrap');
  const previous = overlay.getByTestId('riego-quincena-previous');
  const next = overlay.getByTestId('riego-quincena-next');

  await expect(grid).toBeVisible();
  await expect(grid).toContainText('30 jun');
  await expect(grid).toContainText('E2E-RIEGO-DIA-30');
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  let pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(391);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(grid).toContainText('30 jun');
  await expect(grid).toContainText('E2E-RIEGO-DIA-30');
  await expect(previous).toBeVisible();
  await expect(next).toBeVisible();
  pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(845);
  expect(unexpectedHosts).toEqual([]);
});
