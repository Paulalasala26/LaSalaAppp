const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_RIEGO_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase({ user = login.user, role = 'ADMIN' } = {}) {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [user]: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [user]: role }),
    'lasala-riego-v1': JSON.stringify({
      '17': {
        '28': { '2': 'E2E-RIEGO-DIA-28' },
        '29': { '2': 'E2E-RIEGO-DIA-29' },
        '30': { '2': 'E2E-RIEGO-DIA-30' },
        '31': { '2': 'E2E-RIEGO-DIA-31' }
      },
      '18': { '30': { '2': 'E2E-RIEGO-INV-18' } },
      '1A': { '141': { '2': 'E2E-RIEGO-INV-1A-19OCT', '3': 'E2E-RIEGO-INV-1A-19OCT' } }
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

function firebaseEtag(value) {
  if (value == null) return 'null_etag';
  return `"${createHash('sha1').update(JSON.stringify(value)).digest('hex')}"`;
}

function riegoGuardado(database) {
  const raw = database['lasala-riego-v1'];
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function textoGuardadoRiego(database, invId, day, street) {
  const value = riegoGuardado(database)?.[invId]?.[day]?.[street];
  return value && typeof value === 'object' ? value.texto : value;
}

async function openRiego(page, database, {
  writeDelayMs = 0,
  user = login.user,
  loginFirst = true,
  quickAction = 'riego',
  fixedTime = '2026-06-30T10:00:00+02:00'
} = {}) {
  const unexpectedHosts = [];
  const writes = [];
  let networkAvailable = true;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, If-Match, X-Firebase-ETag',
    'access-control-expose-headers': 'ETag'
  };
  await page.route(firebaseUrl, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== firebaseHost) {
      unexpectedHosts.push(url.hostname);
      await route.abort();
      return;
    }
    if (!networkAvailable && request.method() !== 'OPTIONS') {
      await route.abort('internetdisconnected');
      return;
    }
    const path = url.pathname.replace(/^\//, '').replace(/\.json$/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const value = readAt(database, path);
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (request.method() === 'GET') {
      const headers = request.headers()['x-firebase-etag'] === 'true' ? { etag: firebaseEtag(value) } : {};
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ...headers }, body: JSON.stringify(value) });
      return;
    }
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    writes.push({ method: request.method(), path: path.join('/'), body });
    if (writeDelayMs) await new Promise(resolve => setTimeout(resolve, writeDelayMs));
    const ifMatch = request.headers()['if-match'];
    if (ifMatch && ifMatch !== firebaseEtag(readAt(database, path))) {
      await route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'etag mismatch' }) });
      return;
    }
    if (request.method() === 'PUT') writeAt(database, path, body);
    else if (request.method() === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (request.method() === 'DELETE') writeAt(database, path, null);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, etag: firebaseEtag(readAt(database, path)) }, body: JSON.stringify(body) });
  });
  await page.clock.setFixedTime(new Date(fixedTime));
  await page.goto('/');
  if(loginFirst){
    await page.locator('#login-user').evaluate((select, value) => select.add(new Option(`Usuario ${value}`, value)), user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(login.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }
  await expect(page.locator('#app')).toBeVisible();
  if (quickAction === 'hojas-riego') await page.getByRole('button', { name: 'Hojas de riego' }).click();
  else await page.locator(`.home-shortcut-card[onclick="handleQuickAction('${quickAction}')"]`).click();
  const overlay = page.locator('#riego-overlay');
  await expect(overlay).toBeVisible();
  await page.locator('#riego-inv-selector-toggle').click();
  await page.locator('[data-rinv="17"]').click();
  return { overlay, database, unexpectedHosts, writes, setNetworkAvailable: value => { networkAvailable = !!value; } };
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

async function openImprimirRiego(page, overlay) {
  await overlay.getByRole('button', { name: 'Imprimir' }).click();
  const selector = page.locator('#imprimir-resumen-overlay');
  await expect(selector).toBeVisible();
  return selector;
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

test('UAT-018: dos sesiones guardan cambios de Riego en celdas distintas', async ({ page, context }) => {
  const database = fixtureDatabase();
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  database['lasala-users-v1'] = JSON.stringify({ [login.user]: passwordHash, E2E_RIEGO_ADMIN_2: passwordHash });
  database['lasala-roles-v1'] = JSON.stringify({ [login.user]: 'ADMIN', E2E_RIEGO_ADMIN_2: 'ADMIN' });
  const otherPage = await context.newPage();
  try {
    const first = await openRiego(page, database, { writeDelayMs: 150 });
    // Mantener la sesión que ya tiene la primera pestaña y arrancar la
    // segunda como otro usuario antes de cargar su propio estado JS.
    await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_RIEGO_ADMIN_2', ts: Date.now() })));
    const second = await openRiego(otherPage, database, { writeDelayMs: 150, user: 'E2E_RIEGO_ADMIN_2', loginFirst: false });
    const firstGrid = page.locator('#riego-grid-wrap');
    const secondGrid = otherPage.locator('#riego-grid-wrap');
    const day = await firstGrid.locator('input[data-rinv="17"][readonly]').evaluateAll(elements =>
      elements.find(element => Number(element.dataset.dia) > 31)?.dataset.dia
    );
    const firstRow = firstGrid.locator(`tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
    const secondRow = secondGrid.locator(`tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
    await firstRow.locator('td').first().click();
    await secondRow.locator('td').first().click();
    const firstForm = page.locator('#riego-manual-overlay');
    const secondForm = otherPage.locator('#riego-manual-overlay');
    for (const [form, street, minutes] of [[firstForm, '2', '10'], [secondForm, '3', '20']]) {
      await form.locator('input[name="rmb-modo-17"]').nth(2).check();
      const range = form.locator('#rmb-detalle-17 .rmb-tramo-row select');
      await range.first().selectOption(street);
      await range.nth(1).selectOption(street);
      await form.locator('.rm-agua-min').first().selectOption(minutes);
    }

    await Promise.all([
      firstForm.locator('#rm-guardar-btn').click(),
      secondForm.locator('#rm-guardar-btn').click()
    ]);
    await expect.poll(() => first.writes.length + second.writes.length).toBeGreaterThanOrEqual(3);
    const saved = riegoGuardado(database)?.['17']?.[day] || {};
    expect(saved['2']).toBeTruthy();
    expect(saved['3']).toBeTruthy();
    expect(textoGuardadoRiego(database, '17', day, '2')).toContain('10');
    expect(textoGuardadoRiego(database, '17', day, '3')).toContain('20');
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await otherPage.close();
  }
});

test('UAT-125: dos sesiones guardan riegos simultáneos en invernaderos diferentes', async ({ page, context }) => {
  const database = fixtureDatabase();
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  database['lasala-users-v1'] = JSON.stringify({ [login.user]: passwordHash, E2E_RIEGO_ADMIN_2: passwordHash });
  database['lasala-roles-v1'] = JSON.stringify({ [login.user]: 'ADMIN', E2E_RIEGO_ADMIN_2: 'ADMIN' });
  const otherPage = await context.newPage();
  try {
    const first = await openRiego(page, database, { writeDelayMs: 150 });
    await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_RIEGO_ADMIN_2', ts: Date.now() })));
    const second = await openRiego(otherPage, database, { writeDelayMs: 150, user: 'E2E_RIEGO_ADMIN_2', loginFirst: false });
    await otherPage.locator('#riego-inv-selector-toggle').click();
    await otherPage.locator('[data-rinv="18"]').click();

    const day = await page.locator('#riego-grid-wrap input[data-rinv="17"][readonly]').evaluateAll(elements =>
      elements.find(element => Number(element.dataset.dia) > 31)?.dataset.dia
    );
    const firstRow = page.locator(`#riego-grid-wrap tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
    const secondRow = otherPage.locator(`#riego-grid-wrap tr:has(input[data-rinv="18"][data-dia="${day}"])`).first();
    await firstRow.locator('td').first().click();
    await secondRow.locator('td').first().click();
    const firstForm = page.locator('#riego-manual-overlay');
    const secondForm = otherPage.locator('#riego-manual-overlay');
    for (const [form, invId, street, minutes] of [[firstForm, '17', '2', '10'], [secondForm, '18', '2', '20']]) {
      await form.locator(`input[name="rmb-modo-${invId}"]`).nth(2).check();
      const range = form.locator(`#rmb-detalle-${invId} .rmb-tramo-row select`);
      await range.first().selectOption(street);
      await range.nth(1).selectOption(street);
      await form.locator('.rm-agua-min').first().selectOption(minutes);
    }
    await Promise.all([firstForm.locator('#rm-guardar-btn').click(), secondForm.locator('#rm-guardar-btn').click()]);
    await expect.poll(() => first.writes.length + second.writes.length).toBeGreaterThanOrEqual(3);
    await expect.poll(() => [
      textoGuardadoRiego(database, '17', day, '2')?.includes('10') ?? false,
      textoGuardadoRiego(database, '18', day, '2')?.includes('20') ?? false
    ], { timeout: 10000 }).toEqual([true, true]);

    const saved = riegoGuardado(database);
    expect(textoGuardadoRiego(database, '17', day, '2')).toContain('10');
    expect(textoGuardadoRiego(database, '18', day, '2')).toContain('20');
    expect(saved['17'][day]['2']).toBeTruthy();
    expect(saved['18'][day]['2']).toBeTruthy();
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await otherPage.close();
  }
});

test('UAT-126: una edición concurrente de la misma celda Riego avisa y conserva el dato remoto', async ({ page, context }) => {
  const database = fixtureDatabase();
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  database['lasala-users-v1'] = JSON.stringify({ [login.user]: passwordHash, E2E_RIEGO_ADMIN_2: passwordHash });
  database['lasala-roles-v1'] = JSON.stringify({ [login.user]: 'ADMIN', E2E_RIEGO_ADMIN_2: 'ADMIN' });
  const otherPage = await context.newPage();
  try {
    const first = await openRiego(page, database);
    await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_RIEGO_ADMIN_2', ts: Date.now() })));
    const second = await openRiego(otherPage, database, { user: 'E2E_RIEGO_ADMIN_2', loginFirst: false });
    const day = await page.locator('#riego-grid-wrap input[data-rinv="17"][readonly]').evaluateAll(elements =>
      elements.find(element => Number(element.dataset.dia) > 31)?.dataset.dia
    );
    const firstRow = page.locator(`#riego-grid-wrap tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
    const secondRow = otherPage.locator(`#riego-grid-wrap tr:has(input[data-rinv="17"][data-dia="${day}"])`).first();
    await firstRow.locator('td').first().click();
    await secondRow.locator('td').first().click();
    const firstForm = page.locator('#riego-manual-overlay');
    const secondForm = otherPage.locator('#riego-manual-overlay');
    for (const [form, minutes] of [[firstForm, '10'], [secondForm, '20']]) {
      await form.locator('input[name="rmb-modo-17"]').nth(2).check();
      const range = form.locator('#rmb-detalle-17 .rmb-tramo-row select');
      await range.first().selectOption('2');
      await range.nth(1).selectOption('2');
      await form.locator('.rm-agua-min').first().selectOption(minutes);
    }
    await firstForm.locator('#rm-guardar-btn').click();
    await expect.poll(() => textoGuardadoRiego(database, '17', day, '2')).toContain('10');
    const remotoAntesDelConflicto = riegoGuardado(database)?.['17']?.[day]?.['2'];

    await secondForm.locator('#rm-guardar-btn').click();
    await expect(otherPage.locator('#aviso-fallo-guardado')).toContainText('misma celda de Riego');
    expect(riegoGuardado(database)?.['17']?.[day]?.['2']).toEqual(remotoAntesDelConflicto);
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await otherPage.close();
  }
});

test('UAT-016–017: Riego conserva un cambio sin conexión y lo sincroniza al recuperar la red', async ({ page, context }) => {
  const database = fixtureDatabase();
  const seeded = JSON.parse(database['lasala-riego-v1']);
  seeded['17']['32'] = { '2': '10 + PP + 1º HORA' };
  database['lasala-riego-v1'] = JSON.stringify(seeded);
  const { unexpectedHosts, setNetworkAvailable } = await openRiego(page, database);
  const cell = page.locator(`#riego-grid-wrap textarea[ondblclick*="'17',32"]`);
  await expect(cell).toHaveValue('10 + PP + 1º HORA');
  await cell.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();

  await context.setOffline(true);
  setNetworkAvailable(false);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await form.locator('.rm-agua-min').first().selectOption('20');
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect(page.locator('#aviso-fallo-guardado')).toContainText('Sin conexión');
  await expect.poll(() => page.evaluate(() => {
    const queue = JSON.parse(localStorage.getItem('lasala-offline-queue-v1') || '[]');
    return queue.filter(action => action.fn === 'aplicarSnapshotRiegoPendiente').length;
  })).toBe(1);
  expect(textoGuardadoRiego(database, '17', '32', '2')).toBe('10 + PP + 1º HORA');

  await page.evaluate(() => {
    window.__e2eOnlineEvents = 0;
    window.addEventListener('online', () => { window.__e2eOnlineEvents++; });
  });
  setNetworkAvailable(true);
  await context.setOffline(false);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__e2eOnlineEvents)).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lasala-offline-queue-v1') || '[]'))).toEqual([]);
  await expect.poll(() => textoGuardadoRiego(database, '17', '32', '2')).toBe('PP + 1º HORA + 20');
  await expect(page.locator('#aviso-fallo-guardado')).toBeHidden();
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-011 y UAT-068: Riego carga los registros del invernadero en la quincena actual', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);

  await expect(overlay.getByTestId('riego-quincena-label')).toContainText('29 jun — 12 jul');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-30');
  await expect(page.locator('#riego-grid-wrap')).toContainText('E2E-RIEGO-DIA-31');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-015 y UAT-071: cambiar de invernadero no arrastra datos del anterior', async ({ page }) => {
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

test('UAT-104: VIGUERAS puede abrir y editar un riego histórico autorizado', async ({ page }) => {
  const database = fixtureDatabase({ user: 'VIGUERAS', role: 'ADMIN' });
  const { overlay, unexpectedHosts } = await openRiego(page, database, { user: 'VIGUERAS' });
  const celda = page.locator('#riego-grid-wrap td[ondblclick*="editarRiegoManualDesdeCelda"]').filter({ hasText: 'E2E-RIEGO-DIA-29' });
  await celda.dblclick();

  const form = page.locator('#riego-manual-overlay');
  await expect(form).toBeVisible();
  await expect(form.locator('#rm-dia')).toHaveValue('29');
  await expect(form.getByTestId('riego-borrar-original')).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-105: REGANTE consulta las instrucciones de Hojas de riego sin controles de edición', async ({ page }) => {
  const database = fixtureDatabase({ user: 'REGANTE2', role: 'REGANTE' });
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database, {
    user: 'REGANTE2',
    quickAction: 'hojas-riego'
  });
  const celda = page.locator('#riego-grid-wrap td').filter({ hasText: 'E2E-RIEGO-DIA-31' }).first();
  await celda.click();

  const consulta = page.locator('#riego-consulta-overlay');
  await expect(consulta).toBeVisible();
  await expect(consulta.getByTestId('riego-consulta-texto')).toHaveText('E2E-RIEGO-DIA-31');
  await expect(consulta.locator('#rm-dia, .rm-agua-min, #rm-guardar-btn, [data-testid="riego-borrar-original"]')).toHaveCount(0);
  expect(writes.filter(write => write.method !== 'GET')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-106: el alta manual no muestra una acción para borrar registros', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database);
  const { form } = await openManualRiegoOnFutureDay(page);

  await expect(form.getByTestId('riego-borrar-original')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Aplicar' })).toBeVisible();
  expect(writes.filter(write => write.method !== 'GET')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-107, UAT-108 y UAT-110: borrar identifica y elimina solo el riego original', async ({ page }) => {
  const database = fixtureDatabase();
  const originalInv18 = JSON.stringify(riegoGuardado(database)['18']['30']);
  const originalInv17Day31 = JSON.stringify(riegoGuardado(database)['17']['31']);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const celda = page.locator('#riego-grid-wrap td[ondblclick*="editarRiegoManualDesdeCelda"]').filter({ hasText: 'E2E-RIEGO-DIA-30' });
  await celda.dblclick();
  const form = page.locator('#riego-manual-overlay');
  await expect(form.getByTestId('riego-borrar-original')).toBeVisible();

  await form.locator('.rmb-inv-chk[value="18"]').check();
  await form.locator('#rm-dia').selectOption('31');
  let confirmation = '';
  page.once('dialog', async dialog => {
    confirmation = dialog.message();
    await dialog.accept();
  });
  await form.getByTestId('riego-borrar-original').click();

  expect(confirmation).toContain('30 jun');
  expect(confirmation).toContain('INV 17');
  expect(confirmation).toContain('C/1702');
  expect(confirmation).not.toContain('INV 18');
  expect(confirmation).not.toContain('1 jul');
  await expect.poll(() => riegoGuardado(database)?.['17']?.['30']?.['2']).toBeUndefined();
  expect(JSON.stringify(riegoGuardado(database)['18']['30'])).toBe(originalInv18);
  expect(JSON.stringify(riegoGuardado(database)['17']['31'])).toBe(originalInv17Day31);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-109: cancelar el borrado deja intacto el riego original', async ({ page }) => {
  const database = fixtureDatabase();
  const before = database['lasala-riego-v1'];
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database);
  const celda = page.locator('#riego-grid-wrap td[ondblclick*="editarRiegoManualDesdeCelda"]').filter({ hasText: 'E2E-RIEGO-DIA-30' });
  await celda.dblclick();
  const form = page.locator('#riego-manual-overlay');
  page.once('dialog', dialog => dialog.dismiss());
  await form.getByTestId('riego-borrar-original').click();

  await expect(form).toBeVisible();
  expect(database['lasala-riego-v1']).toBe(before);
  expect(writes.filter(write => write.method !== 'GET')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-114, UAT-115, UAT-116 y UAT-124: imprimir abre un selector diario y alinea las acciones', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const urlBefore = page.url();
  const selector = await openImprimirRiego(page, overlay);
  const daySelect = selector.getByTestId('riego-print-day');

  await expect(selector.getByText('Día de riego', { exact: true })).toBeVisible();
  await expect(daySelect.locator('option')).toHaveCount(14);
  await expect(daySelect).toHaveValue('30');
  await expect(selector.getByText('Días a imprimir', { exact: true })).toHaveCount(0);
  await expect(selector.locator('.rr-dia-chk')).toHaveCount(0);
  expect(await selector.locator('label').evaluateAll(labels => {
    const day = labels.findIndex(label => label.textContent.trim() === 'Día de riego');
    const greenhouses = labels.findIndex(label => label.textContent.trim() === 'Invernaderos');
    return day >= 0 && greenhouses > day;
  })).toBe(true);
  expect(await selector.getByRole('button', { name: 'Imprimir' }).evaluate(button => getComputedStyle(button.parentElement).justifyContent)).toBe('flex-end');
  expect(page.url()).toBe(urlBefore);

  await selector.getByRole('button', { name: 'Cancelar' }).click();
  const { form } = await openManualRiegoOnFutureDay(page);
  expect(await form.getByTestId('riego-form-actions').evaluate(el => el.style.marginLeft)).toBe('auto');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-117 y UAT-118: la impresión ofrece solo los días de la quincena y elige el primero si hoy queda fuera', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  await overlay.getByTestId('riego-quincena-previous').click();
  await expect(overlay.getByTestId('riego-quincena-label')).toContainText('Quincena 1');
  const selector = await openImprimirRiego(page, overlay);
  const daySelect = selector.getByTestId('riego-print-day');
  const options = await daySelect.locator('option').evaluateAll(elements => elements.map(el => Number(el.value)));

  expect(options).toEqual(Array.from({ length: 14 }, (_, index) => 15 + index));
  await expect(daySelect).toHaveValue('15');
  await daySelect.selectOption('28');
  await expect(daySelect).toHaveValue('28');
  await expect(selector.locator('select')).toHaveCount(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-119 y UAT-120: la impresión usa el día y los invernaderos elegidos aunque no se abrieran antes', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const selector = await openImprimirRiego(page, overlay);
  await selector.locator('.rr-inv-chk[value="17"]').check();
  await selector.locator('.rr-inv-chk[value="18"]').check();
  await selector.getByTestId('riego-print-day').selectOption('30');
  await selector.getByRole('button', { name: 'Imprimir' }).click();

  const iframe = page.locator('#print-resumen-iframe');
  await expect(iframe).toBeAttached();
  await expect.poll(() => iframe.evaluate(frame => frame.contentDocument.body.innerText)).toContain('E2E-RIEGO-DIA-30');
  const previewText = await iframe.evaluate(frame => frame.contentDocument.body.innerText);
  expect(previewText).toContain('INV 17');
  expect(previewText).toContain('INV 18');
  expect(previewText).toContain('E2E-RIEGO-INV-18');
  expect(previewText).not.toContain('E2E-RIEGO-DIA-29');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-121: la vista previa de INV 1A conserva los riegos y calles de la quincena 19/10–01/11', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database, { fixedTime: '2026-10-25T10:00:00+01:00' });
  await expect(overlay.getByTestId('riego-quincena-label')).toContainText('19 oct — 1 nov');
  const selector = await openImprimirRiego(page, overlay);
  await selector.locator('.rr-inv-chk[value="17"]').uncheck();
  await selector.locator('.rr-inv-chk[value="1A"]').check();
  await selector.getByTestId('riego-print-day').selectOption('141');
  await selector.getByRole('button', { name: 'Imprimir' }).click();

  const iframe = page.locator('#print-resumen-iframe');
  await expect(iframe).toBeAttached();
  await expect.poll(() => iframe.evaluate(frame => frame.contentDocument.body.innerText)).toContain('E2E-RIEGO-INV-1A-19OCT');
  const previewText = await iframe.evaluate(frame => frame.contentDocument.body.innerText);
  expect(previewText).toContain('19 OCTUBRE 2026');
  expect(previewText).toContain('C/102-103');
  expect(previewText).not.toContain('INV 17');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-122: imprimir un día sin riegos muestra aviso y no crea una hoja vacía', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const selector = await openImprimirRiego(page, overlay);
  await selector.locator('.rr-inv-chk[value="17"]').check();
  await selector.getByTestId('riego-print-day').selectOption('32');
  await selector.getByRole('button', { name: 'Imprimir' }).click();

  await expect(page.locator('#app-toast')).toContainText('No hay riegos registrados');
  await expect(page.locator('#print-resumen-iframe')).toHaveCount(0);
  await expect(selector).toBeVisible();
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-123: la vista previa contiene fecha, invernadero, calles e instrucciones en A4', async ({ page }) => {
  const database = fixtureDatabase();
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const selector = await openImprimirRiego(page, overlay);
  await selector.locator('.rr-inv-chk[value="17"]').check();
  await selector.getByTestId('riego-print-day').selectOption('30');
  await selector.getByRole('button', { name: 'Imprimir' }).click();

  const iframe = page.locator('#print-resumen-iframe');
  await expect(iframe).toBeAttached();
  await expect.poll(() => iframe.evaluate(frame => frame.contentDocument.body.innerText)).toContain('E2E-RIEGO-DIA-30');
  const preview = await iframe.evaluate(frame => ({
    text: frame.contentDocument.body.innerText,
    pageRule: [...frame.contentDocument.styleSheets].flatMap(sheet => [...sheet.cssRules]).find(rule => rule.cssText.includes('@page'))?.cssText || ''
  }));
  expect(preview.text).toContain('30 JUNIO 2026');
  expect(preview.text).toContain('INV 17');
  expect(preview.text).toContain('C/1702');
  expect(preview.text).toContain('E2E-RIEGO-DIA-30');
  expect(preview.pageRule.toLowerCase()).toContain('a4');
  expect(preview.text).not.toContain('E2E-RIEGO-DIA-29');
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

test('UAT-083, UAT-088, UAT-112, UAT-1375 y UAT-1396: no se crean tareas sin Trabajo ni desde fechas pasadas', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-tareas-v1'] = JSON.stringify([]);
  const tasksBefore = JSON.stringify(database['lasala-tareas-v1']);
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);
  await expect(form.locator('input[name="rmb-modo-17"]').first()).toBeChecked();
  await form.locator('.rm-agua-min').first().selectOption('10');
  await form.locator('.rm-abono-cat').first().selectOption('SAL');
  const abonoMinutos = await form.locator('.rm-abono-tiempo option:not([value=""])').first().getAttribute('value');
  await form.locator('.rm-abono-tiempo').first().selectOption(abonoMinutos);
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);

  const saved = riegoGuardado(database)['17'][day];
  expect(Object.keys(saved).map(Number).sort((a,b) => a-b)).toEqual(streets);
  expect(Object.values(saved).every(value => JSON.stringify(value).includes('10')), JSON.stringify(saved)).toBe(true);
  expect(JSON.stringify(database['lasala-tareas-v1'])).toBe(tasksBefore);

  const filaHistorica = page.locator('#riego-grid-wrap tr').filter({ hasText: '29 jun' }).first();
  await filaHistorica.locator('td').last().click();
  await expect(page.locator('#riego-manual-overlay')).toBeHidden();
  await expect(page.locator('#riego-consulta-overlay')).toBeHidden();
  expect(JSON.stringify(database['lasala-tareas-v1'])).toBe(tasksBefore);
  expect(writes.filter(write => write.path === 'lasala-tareas-v1')).toEqual([]);
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

test('UAT-013 y UAT-094: un riego aplicado reaparece en el mismo invernadero y calle al volver a entrar', async ({ page }) => {
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

test('UAT-014 y UAT-095: un riego aplicado reaparece idéntico después de recargar la aplicación', async ({ page }) => {
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

test('UAT-012 y UAT-096: editar el agua de un riego conserva el Trabajo y el horario existentes', async ({ page }) => {
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


test('UAT-1376: PREPARAR sin Trabajo reconocido no crea tarea de PEÓN', async ({ page }) => {
  const database = fixtureDatabase();
  const tasksBefore = JSON.stringify(database['lasala-tareas-v1'] ?? null);
  const { overlay, unexpectedHosts } = await openRiego(page, database);
  const { form, grid, day } = await openManualRiegoOnFutureDay(page);
  const streets = await callesVisiblesDelDia(grid, day);

  await form.locator('.rm-trabajo-chk[value="PREPARAR"]').check();
  await form.locator('#rm-guardar-btn').click();
  await expect(form).toBeHidden();
  await expect.poll(() => Object.keys(riegoGuardado(database)?.['17']?.[day] || {}).length).toBe(streets.length);
  const saved = riegoGuardado(database)['17'][day];
  expect(Object.values(saved).every(value => JSON.stringify(value).includes('PREPARAR'))).toBe(true);
  expect(JSON.stringify(database['lasala-tareas-v1'] ?? null)).toBe(tasksBefore);
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});


test('UAT-1377–1379 y UAT-1403: Trabajo reconocido aparece sin acción masiva', async ({ page }) => {
  test.fail(true, 'La expectativa UAT requiere generación automática; la versión actual conserva la acción explícita «Generar tareas».');
  const database = fixtureDatabase();
  const { overlay } = await openRiego(page, database);
  await expect(overlay.locator('button[onclick="generarTareasDesdeRiego()"]')).toHaveCount(0);
  const grid = page.locator('#riego-grid-wrap');

  const guardarTrabajo = async dia => {
    const row = grid.locator(`tr:has(input[data-rinv="17"][data-dia="${dia}"])`).first();
    await row.locator('td').first().click();
    const form = page.locator('#riego-manual-overlay');
    await expect(form).toBeVisible();
    await form.locator('.rm-trabajo-chk[value="PP"]').check();
    await form.locator('#rm-guardar-btn').click();
    await expect(form).toBeHidden();
    return form;
  };

  await guardarTrabajo('30');
  expect.soft(JSON.parse(database['lasala-tareas-v1'] ?? '[]')).toHaveLength(1);
  await guardarTrabajo('31');
  const tareas = JSON.parse(database['lasala-tareas-v1'] ?? '[]');
  expect.soft(tareas.filter(t => t.fechaISO === '2026-06-30')).toHaveLength(1);
  expect.soft(tareas.filter(t => t.fechaISO === '2026-07-01')).toHaveLength(1);

  await overlay.getByRole('button').filter({ hasText: '✕' }).click();
  await page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('tareas')"]`).click();
  const tareasOverlay = page.locator('#tareas-overlay');
  await expect(tareasOverlay).toBeVisible();
  await tareasOverlay.getByRole('button', { name: 'Tareas de hoy' }).click();
  await expect.soft(tareasOverlay.locator('#tareas-gestor-content-wrap .tarea-card')).toHaveCount(1);
  await tareasOverlay.getByRole('button', { name: 'Tareas de mañana' }).click();
  await expect.soft(tareasOverlay.locator('#tareas-gestor-content-wrap .tarea-card')).toHaveCount(1);
});


test('UAT-1426: consultar Hojas de riego como REGANTE no genera tareas PEÓN', async ({ page }) => {
  const database = fixtureDatabase({ user: 'REGANTE2', role: 'REGANTE' });
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  database['lasala-users-v1'] = JSON.stringify({
    REGANTE2: passwordHash,
    E2E_RIEGO_ADMIN2: passwordHash
  });
  database['lasala-roles-v1'] = JSON.stringify({
    REGANTE2: 'REGANTE',
    E2E_RIEGO_ADMIN2: 'ADMIN'
  });
  database['lasala-tareas-v1'] = JSON.stringify([]);
  const { overlay, unexpectedHosts, writes } = await openRiego(page, database, {
    user: 'REGANTE2',
    quickAction: 'hojas-riego'
  });

  const celda = page.locator('#riego-grid-wrap td').filter({ hasText: 'E2E-RIEGO-DIA-31' }).first();
  await celda.click();
  const consulta = page.locator('#riego-consulta-overlay');
  await expect(consulta).toBeVisible();
  await expect(consulta.getByTestId('riego-consulta-texto')).toHaveText('E2E-RIEGO-DIA-31');
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.path === 'lasala-tareas-v1')).toEqual([]);

  await overlay.getByRole('button', { name: '✕', exact: true }).click();
  await expect(overlay).toBeHidden();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await page.locator('#login-user').evaluate(select => select.add(new Option('E2E_RIEGO_ADMIN2', 'E2E_RIEGO_ADMIN2')));
  await page.locator('#login-user').selectOption('E2E_RIEGO_ADMIN2');
  await page.locator('#login-pass').fill(login.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.locator('#page-home')).toBeVisible();
  await page.locator('#quick-access-block .home-shortcut-card[onclick="handleQuickAction('tareas')"]').click();
  const tasksOverlay = page.locator('#tareas-overlay');
  await expect(tasksOverlay).toBeVisible();
  await expect(tasksOverlay.locator('.tarea-card')).toHaveCount(0);
  expect(JSON.parse(database['lasala-tareas-v1'])).toEqual([]);
  expect(writes.filter(write => write.path === 'lasala-tareas-v1')).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});
