const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const login = { user: 'E2E_PARTIDAS_ADMIN', password: 'e2e-only-password' };

function fixtureDatabase() {
  const passwordHash = createHash('sha256').update(login.password).digest('hex');
  return {
    'lasala-users-v1': JSON.stringify({ [login.user]: passwordHash, E2E_PARTIDAS_ADMIN_2: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ [login.user]: 'ADMIN', E2E_PARTIDAS_ADMIN_2: 'ADMIN' }),
    'lasala-especificos-v1': JSON.stringify({}),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-especificos-partida-v1': JSON.stringify({
      'e2e-partida-001': [{
        fechaISO: '2026-07-27',
        fechaLabel: '27 jul',
        trat: 'E2E-TRATAMIENTO',
        dosis: '1',
        horario: '17:00'
      }],
      'e2e-partida-002': [{
        fechaISO: '2026-07-28',
        fechaLabel: '28 jul',
        trat: 'E2E-TRATAMIENTO-OTRO',
        dosis: '2',
        horario: '18:00'
      }]
    }),
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
      },
      'e2e-partida-002': {
        id: 'e2e-partida-002',
        tipo: 'tunel',
        dia: 57,
        partida: 'E2E-PARTIDA-002',
        clienteVariedad: 'Segunda variedad fixture',
        invId: '17',
        calleDesde: 17,
        calleHasta: 17,
        numBandejas: 10,
        observaciones: 'Segunda observación de fixture'
      },
      'e2e-partida-003': {
        id: 'e2e-partida-003',
        tipo: 'tunel',
        dia: 57,
        partida: 'E2E-PARTIDA-003',
        clienteVariedad: 'Fixture de Sala 5',
        invId: '51',
        calleDesde: 1,
        calleHasta: 1,
        numBandejas: 8,
        observaciones: 'Partida de fixture en otro INV'
      },
      'e2e-partida-004': {
        id: 'e2e-partida-004', tipo: 'tunel', dia: 57,
        partida: 'E2E-PARTIDA-2HV', clienteVariedad: 'Fixture 2HV conocida',
        invId: '17', calleDesde: 16, calleHasta: 16, numBandejas: 8
      },
      'e2e-partida-005': {
        id: 'e2e-partida-005', tipo: 'tunel', dia: 57,
        partida: 'E2E-PARTIDA-3HV', clienteVariedad: 'Fixture 3HV conocida',
        invId: '17', calleDesde: 15, calleHasta: 15, numBandejas: 8
      },
      'e2e-partida-006': {
        id: 'e2e-partida-006', tipo: 'tunel', dia: 57,
        partida: 'E2E-PARTIDA-4HV', clienteVariedad: 'Fixture 4HV conocida',
        invId: '17', calleDesde: 14, calleHasta: 14, numBandejas: 8
      },
      'e2e-partida-007': {
        id: 'e2e-partida-007', tipo: 'tunel', dia: 57,
        partida: 'E2E-PARTIDA-150BIO', clienteVariedad: 'Fixture 150 BIO no habitual',
        invId: '17', calleDesde: 13, calleHasta: 13, numBandejas: 8
      },
      'e2e-partida-008': {
        id: 'e2e-partida-008', tipo: 'tunel', dia: 57,
        partida: 'E2E-PARTIDA-CALLE-1', clienteVariedad: 'Fixture extremo horizontal',
        invId: '17', calleDesde: 1, calleHasta: 1, numBandejas: 8
      }
    }
  };
}

function databaseWithStack({ calle, count, prefix }) {
  const database = fixtureDatabase();
  for (let index = 1; index <= count; index++) {
    const id = `e2e-${prefix}-row-${index}`;
    database['lasala-control-items-v1'][id] = {
      id, tipo: 'tunel', dia: 57, partida: `E2E-${prefix.toUpperCase()}-${index}`,
      clienteVariedad: `Fixture banda ${prefix}`, invId: '17',
      calleDesde: calle, calleHasta: calle, creadoEn: 1000 + index
    };
  }
  return database;
}

test('UAT-726–734, UAT-738 y UAT-742–743: Partidas navega por quincenas y recalcula mapa y ocupación al cambiar periodo o INV', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = {
    'e2e-period-first': {
      id: 'e2e-period-first', tipo: 'tunel', dia: 57, partida: 'E2E-PERIODO-PRIMERA',
      invId: '17', calleDesde: 18, calleHasta: 18, salioDesdeSemanaNumerada: 1
    },
    'e2e-period-second': {
      id: 'e2e-period-second', tipo: 'tunel', dia: 71, partida: 'E2E-PERIODO-SEGUNDA',
      invId: '17', calleDesde: 17, calleHasta: 17, salioDesdeSemanaNumerada: 3
    }
  };
  const { overlay, writes, unexpectedHosts } = await openPartidas(page, { database, selectInv: false });
  const label = overlay.getByTestId('partidas-quincena-label');
  await expect(label).toContainText('Quincena 1');
  await expect(overlay.getByTestId('partidas-quincena-previous')).toBeDisabled();
  await expect(overlay).not.toContainText('Semana del mapa');
  const labelBox = await label.boundingBox();
  const roomButton = await overlay.getByRole('button', { name: 'Sala 2', exact: true }).boundingBox();
  expect(labelBox).not.toBeNull();
  expect(roomButton).not.toBeNull();
  expect(labelBox.y).toBeLessThan(roomButton.y);

  // Cambiar de periodo antes de seleccionar el invernadero conserva el destino elegido.
  await overlay.getByTestId('partidas-quincena-next').click();
  await expect(label).toContainText('Quincena 2');
  expect(await page.evaluate(() => (partidasQuincenaDias(1).inicio - partidasQuincenaDias(0).inicio) / 86400000)).toBe(14);
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '17', exact: true }).click();
  const map = overlay.locator('#partidas-content-wrap');
  await expect(overlay.getByTestId('partidas-inv-heading')).toContainText('Sala 2 · INV.17');
  await expect(overlay.getByTestId('partidas-occupancy-count')).toHaveText('1');
  await expect(map).toContainText('E2E-PERIODO-SEGUNDA');
  await expect(map).not.toContainText('E2E-PERIODO-PRIMERA');

  // La flecha retrocede exactamente a la quincena previa sin escribir ubicaciones.
  await overlay.getByTestId('partidas-quincena-previous').click();
  await expect(label).toContainText('Quincena 1');
  await expect(overlay.getByTestId('partidas-occupancy-count')).toHaveText('1');
  await expect(map).toContainText('E2E-PERIODO-PRIMERA');
  await expect(map).not.toContainText('E2E-PERIODO-SEGUNDA');
  await expect(overlay.getByTestId('partidas-quincena-previous')).toBeDisabled();

  // Volver al selector y entrar de nuevo en el mismo INV mantiene la quincena.
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '17', exact: true }).click();
  await expect(label).toContainText('Quincena 1');
  await expect(map).toContainText('E2E-PERIODO-PRIMERA');

  // El siguiente periodo está vacío, pero mantiene navegación/búsqueda y pone ocupación a cero.
  await overlay.getByTestId('partidas-quincena-next').click();
  await overlay.getByTestId('partidas-quincena-next').click();
  await expect(label).toContainText('Quincena 3');
  await expect(map.getByTestId('partidas-empty-state')).toBeVisible();
  await expect(overlay.locator('#partidas-buscar-partida')).toBeEnabled();
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '16', exact: true }).click();
  await expect(overlay.getByTestId('partidas-occupancy-count')).toHaveText('0');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-735–741: Partidas respeta la entrada/salida semanal y cuenta IDs distintos sin duplicar el mismo registro', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = {
    'e2e-entry-w1-exit-w2': {
      id: 'e2e-entry-w1-exit-w2', tipo: 'tunel', dia: 64, partida: 'E2E-ENTRA-S1-SALE-S2',
      invId: '17', calleDesde: 18, calleHasta: 18, salioDesdeSemanaNumerada: 2
    },
    'e2e-spans-quincenas': {
      id: 'e2e-spans-quincenas', tipo: 'tunel', dia: 57, partida: 'E2E-REPETIDA-EN-PERIODO',
      invId: '17', calleDesde: 16, calleHasta: 16
    },
    'e2e-same-number-one': {
      id: 'e2e-same-number-one', tipo: 'tunel', dia: 57, partida: 'E2E-MISMO-NUMERO',
      invId: '17', calleDesde: 14, calleHasta: 14, salioDesdeSemanaNumerada: 1
    },
    'e2e-same-number-two': {
      id: 'e2e-same-number-two', tipo: 'tunel', dia: 58, partida: 'E2E-MISMO-NUMERO',
      invId: '17', calleDesde: 13, calleHasta: 13, salioDesdeSemanaNumerada: 1
    },
    'e2e-manual-exit-next-period': {
      id: 'e2e-manual-exit-next-period', tipo: 'tunel', dia: 71, partida: 'E2E-SALIDA-MANUAL',
      invId: '17', calleDesde: 12, calleHasta: 12, salioDesdeSemanaNumerada: 3
    }
  };
  const { overlay, writes, unexpectedHosts } = await openPartidas(page, { database });
  const label = overlay.getByTestId('partidas-quincena-label');
  const map = overlay.locator('#partidas-content-wrap');
  const count = overlay.getByTestId('partidas-occupancy-count');

  await expect(label).toContainText('Quincena 1');
  await expect(map).toContainText('E2E-ENTRA-S1-SALE-S2');
  await expect(map.getByText('E2E-MISMO-NUMERO', { exact: true })).toHaveCount(2);
  await expect(count).toHaveText('4');

  await overlay.getByTestId('partidas-quincena-next').click();
  await expect(label).toContainText('Quincena 2');
  await expect(map).not.toContainText('E2E-ENTRA-S1-SALE-S2');
  await expect(map).toContainText('E2E-SALIDA-MANUAL');
  // Una partida que cruza ambas semanas se muestra como un único ID en el mapa.
  await expect(map.getByText('E2E-REPETIDA-EN-PERIODO', { exact: true })).toHaveCount(1);
  await expect(count).toHaveText('2');

  await overlay.getByTestId('partidas-quincena-next').click();
  await expect(label).toContainText('Quincena 3');
  await expect(map).not.toContainText('E2E-SALIDA-MANUAL');
  await expect(map).toContainText('E2E-REPETIDA-EN-PERIODO');
  await expect(count).toHaveText('1');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2388: la salida el primer día de la quincena siguiente quita la ocupación al avanzar el filtro', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = {
    'e2e-salida-primer-dia-quincena-siguiente': {
      id: 'e2e-salida-primer-dia-quincena-siguiente',
      tipo: 'tunel',
      dia: 64,
      partida: 'E2E-SALIDA-PRIMER-DIA-SIGUIENTE',
      invId: '17',
      calleDesde: 11,
      calleHasta: 11,
      salioDesdeSemanaNumerada: 2
    }
  };
  const { overlay, writes, unexpectedHosts } = await openPartidas(page, { database });
  const map = overlay.locator('#partidas-content-wrap');
  const label = overlay.getByTestId('partidas-quincena-label');

  await expect(label).toContainText('Quincena 1');
  await expect(map).toContainText('E2E-SALIDA-PRIMER-DIA-SIGUIENTE');
  await overlay.getByTestId('partidas-quincena-next').click();
  await expect(label).toContainText('Quincena 2');
  await expect(map).not.toContainText('E2E-SALIDA-PRIMER-DIA-SIGUIENTE');
  await overlay.getByTestId('partidas-quincena-previous').click();
  await expect(label).toContainText('Quincena 1');
  await expect(map).toContainText('E2E-SALIDA-PRIMER-DIA-SIGUIENTE');

  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

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

async function openPartidas(page, { loginFirst = true, user = login.user, writeDelayMs = 0, database = fixtureDatabase(), selectInv = true, failWriteStatus = 0 } = {}) {
  const unexpectedHosts = [], writes = [];
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
    writes.push({ path: path.join('/'), body });
    if (writeDelayMs) await new Promise(resolve => setTimeout(resolve, writeDelayMs));
    const ifMatch = request.headers()['if-match'];
    if (ifMatch && ifMatch !== firebaseEtag(readAt(database, path))) {
      await route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'etag mismatch' }) });
      return;
    }
    if (failWriteStatus) {
      await route.fulfill({ status: failWriteStatus, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'forced fixture failure' }) });
      return;
    }
    if (request.method() === 'PUT') writeAt(database, path, body);
    else if (request.method() === 'PATCH') writeAt(database, path, { ...(readAt(database, path) || {}), ...body });
    else if (request.method() === 'DELETE') writeAt(database, path, null);
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, etag: firebaseEtag(readAt(database, path)) }, body: JSON.stringify(body) });
  });

  await page.clock.setFixedTime(new Date('2026-07-27T10:00:00+02:00'));
  await page.goto('/');
  if (loginFirst) {
    await page.locator('#login-user').evaluate((select, username) => select.add(new Option(username, username)), user);
    await page.locator('#login-user').selectOption(user);
    await page.locator('#login-pass').fill(login.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-partidas').click();
  const overlay = page.locator('#partidas-overlay');
  await expect(overlay).toBeVisible();
  if (selectInv) {
    await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
    await overlay.getByRole('button', { name: '17', exact: true }).click();
  }
  return { overlay, unexpectedHosts, database, writes };
}

async function applySpecificToPartida(page, overlay, entryId, tratamiento) {
  await overlay.locator('button').filter({ hasText: 'Añadir Específico aquí' }).click();
  await page.locator(`#partidas-content-wrap div[onclick="togglePartidaEnSeleccionEspecifico('${entryId}')"]`).click();
  await page.getByRole('button', { name: 'Aplicar específico →' }).click();
  const dialog = page.locator('#especifico-por-partidas-overlay');
  await dialog.locator('#eap-trat').selectOption(tratamiento);
  await dialog.locator('#eap-dosis').selectOption('1');
  await dialog.locator('#eap-horario').selectOption('17:00');
  const day = await dialog.locator('#eap-dia').inputValue();
  await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(dialog).toBeHidden();
  return day;
}

test('UAT-028: Partidas muestra el registro conocido del invernadero seleccionado', async ({ page }) => {
  const { overlay, unexpectedHosts } = await openPartidas(page);
  const map = page.locator('#partidas-content-wrap');

  await expect(map).toContainText('E2E-PARTIDA-001');
  await expect(map).not.toContainText('Fixture variedad conocida');
  expect(unexpectedHosts).toEqual([]);
  await expect(overlay).toBeVisible();
});

test('UAT-750–752: el mapa oculta cliente/variedad y diferencia los tipos de planta', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const card = id => overlay.locator(`#partidas-content-wrap [ondragstart="iniciarArrastrePartida('${id}')"]`);

  await expect(card('e2e-partida-001')).toContainText('E2E-PARTIDA-001');
  await expect(card('e2e-partida-001')).not.toContainText('Fixture variedad conocida');
  await card('e2e-partida-001').getByText('E2E-PARTIDA-001', { exact: true }).click();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toContainText('Fixture variedad conocida');
  await history.getByRole('button', { name: 'Cerrar' }).click();

  const expectedTypeStyles = [
    ['e2e-partida-004', '2HV', 'rgb(219, 234, 254)'],
    ['e2e-partida-005', '3HV', 'rgb(237, 233, 254)'],
    ['e2e-partida-006', '4HV', 'rgb(255, 228, 196)'],
    ['e2e-partida-007', '150 BIO', 'rgb(232, 245, 239)']
  ];
  for (const [id, type, background] of expectedTypeStyles) {
    await expect(card(id)).toContainText(`E2E-PARTIDA-${type.replace(' ', '')}`);
    await expect(card(id)).toContainText(type);
    await expect.poll(() => card(id).evaluate(element => element.style.backgroundColor)).toBe(background);
  }

  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-753 y UAT-761: el pasillo y las dos bandas mantienen cabeceras separadas', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const map = overlay.locator('#partidas-content-wrap');
  const headerBands = map.locator('div[style*="background:#dce8f5"]');
  const aisle = map.getByText('PASILLO', { exact: true });

  await expect(aisle).toBeVisible();
  await expect(headerBands).toHaveCount(2);
  const topHeader = await headerBands.nth(0).boundingBox();
  const lowerHeader = await headerBands.nth(1).boundingBox();
  const aisleBox = await aisle.boundingBox();
  expect(topHeader).not.toBeNull();
  expect(lowerHeader).not.toBeNull();
  expect(aisleBox).not.toBeNull();
  expect(topHeader.y + topHeader.height).toBeLessThanOrEqual(aisleBox.y);
  expect(aisleBox.y + aisleBox.height).toBeLessThanOrEqual(lowerHeader.y);
  expect(lowerHeader.width).toBeGreaterThan(0);
  expect(map).toContainText('E2E-PARTIDA-001');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-756: con distinto número de calles, bandas, cabeceras y pasillo comparten el ancho máximo', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { selectInv: false });
  await overlay.getByRole('button', { name: 'Sala 4', exact: true }).click();
  await overlay.getByRole('button', { name: '40', exact: true }).click();
  const map = overlay.locator('#partidas-content-wrap');
  const grid = map.locator('div[style*="overflow-x:auto"]');
  const headerBands = grid.locator('div[style*="background:#dce8f5"]');
  const sections = grid.locator(':scope > div:nth-child(2), :scope > div:nth-child(4)');
  const aisle = map.getByText('PASILLO', { exact: true });

  await expect(headerBands).toHaveCount(2);
  const widths = await headerBands.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().width)));
  expect(widths[0]).toBe(widths[1]);
  const expectedWidth = await headerBands.nth(1).evaluate(node => Math.round(Array.from(node.children).reduce((total, cell) => total + cell.getBoundingClientRect().width, 0)));
  expect(widths[0]).toBeGreaterThanOrEqual(expectedWidth);
  await expect(sections).toHaveCount(2);
  const sectionWidths = await sections.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().width)));
  expect(sectionWidths).toEqual(widths);
  expect(await aisle.getAttribute('style')).toContain(`min-width:${expectedWidth}px`);
  expect(unexpectedHosts).toEqual([]);
  expect(writes).toEqual([]);
});

test('UAT-765: los huecos de calles ocupadas se distinguen y señalan el destino', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = { 'e2e-partida-001': database['lasala-control-items-v1']['e2e-partida-001'] };
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { database });
  const map = overlay.locator('#partidas-content-wrap');
  const occupiedStreetSlot = map.locator('[data-testid="partidas-empty-slot"][data-calle="18"]').first();
  const otherSlot = map.locator('[data-testid="partidas-empty-slot"][data-calle="13"]').first();

  await expect(occupiedStreetSlot).toHaveAttribute('aria-label', 'Hueco libre en calle 18');
  await expect(occupiedStreetSlot).toHaveAttribute('title', 'Hueco libre en calle 18');
  await expect.poll(() => occupiedStreetSlot.locator('div').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(238, 244, 251)');
  await expect.poll(() => otherSlot.locator('div').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-759, UAT-762, UAT-764 y UAT-766: INV vacío amplía filas automáticamente y conserva scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = {};
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { database });
  const map = overlay.locator('#partidas-content-wrap');
  const rows = map.locator('div[style*="min-height:58px"]');
  const emptySlots = map.locator('[onclick^="clicCeldaVaciaPartidas"]');
  const aisle = map.getByText('PASILLO', { exact: true });

  await expect(map).toContainText('INV.17');
  await expect(map.getByText('+ 5 filas', { exact: true })).toHaveCount(0);
  await expect(rows).toHaveCount(10);
  await expect(emptySlots).toHaveCount(180);
  const grid = map.locator('div[style*="overflow-x:auto"]');
  await expect.poll(() => grid.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
  await grid.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(map.getByText('PASILLO', { exact: true })).toBeVisible();
  await grid.evaluate(element => { element.scrollLeft = 0; });
  const upperSlot = await emptySlots.first().boundingBox();
  const lowerSlot = await emptySlots.last().boundingBox();
  const aisleBox = await aisle.boundingBox();
  expect(upperSlot.y).toBeLessThan(aisleBox.y);
  expect(lowerSlot.y).toBeGreaterThan(aisleBox.y);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-767: al superar cinco filas arriba, solo se amplía la banda superior', async ({ page }) => {
  const { overlay, writes, unexpectedHosts } = await openPartidas(page, {
    database: databaseWithStack({ calle: 1, count: 5, prefix: 'top' })
  });
  const grid = overlay.locator('#partidas-content-wrap div[style*="overflow-x:auto"]');
  const sections = grid.locator(':scope > div:nth-child(2), :scope > div:nth-child(4)');
  const countRows = section => section.evaluate(element => Array.from(element.children).filter(child => child.style.minHeight === '58px').length);
  await expect(sections).toHaveCount(2);
  expect(await countRows(sections.nth(0))).toBe(6);
  expect(await countRows(sections.nth(1))).toBe(5);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-768–769: al superar cinco filas abajo, la banda superior conserva su tamaño', async ({ page }) => {
  const { overlay, writes, unexpectedHosts } = await openPartidas(page, {
    database: databaseWithStack({ calle: 19, count: 6, prefix: 'bottom' })
  });
  const grid = overlay.locator('#partidas-content-wrap div[style*="overflow-x:auto"]');
  const sections = grid.locator(':scope > div:nth-child(2), :scope > div:nth-child(4)');
  const countRows = section => section.evaluate(element => Array.from(element.children).filter(child => child.style.minHeight === '58px').length);
  await expect(sections).toHaveCount(2);
  expect(await countRows(sections.nth(0))).toBe(5);
  expect(await countRows(sections.nth(1))).toBe(6);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-770–772: mover y reabrir una partida conserva la fila alta y los huecos existentes', async ({ page }) => {
  const database = fixtureDatabase();
  const items = database['lasala-control-items-v1'] = {};
  for (const [calle, count, prefix] of [[18, 8, 'source-high'], [1, 7, 'target-gap']]) {
    for (let index = 1; index <= count; index++) {
      const id = `e2e-${prefix}-row-${index}`;
      items[id] = {
        id, tipo: 'tunel', dia: 57, partida: `E2E-${prefix.toUpperCase()}-${index}`,
        clienteVariedad: `Fixture ${prefix}`, invId: '17', calleDesde: calle,
        calleHasta: calle, creadoEn: 1000 + index
      };
    }
  }
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { database });
  const map = overlay.locator('#partidas-content-wrap');
  const card = id => map.locator(`[ondragstart="iniciarArrastrePartida('${id}')"]`);
  const rowNumber = element => element.evaluate(node => {
    let row = node;
    while (row && row.style.minHeight !== '58px') row = row.parentElement;
    return row ? [...row.parentElement.children].indexOf(row) + 1 : null;
  });
  const source = card('e2e-source-high-row-8');
  await expect.poll(() => rowNumber(source)).toBe(8);
  await expect.poll(() => rowNumber(card('e2e-target-gap-row-7'))).toBe(7);

  await source.locator('button[onclick^="seleccionarPartidaParaMover"]').click();
  const calleUnoSlots = await map.locator('[onclick^="clicCeldaVaciaPartidas"]').evaluateAll(nodes => nodes.filter(node => node.getAttribute('onclick') === "clicCeldaVaciaPartidas('17',1)"));
  expect(calleUnoSlots).toHaveLength(1);
  await map.locator("[onclick=\"clicCeldaVaciaPartidas('17',1)\"]").click();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-source-high-row-8'].tramos).toEqual([{ desde: 1, hasta: 1 }]);
  await expect.poll(() => rowNumber(card('e2e-source-high-row-8'))).toBe(8);
  const savedPosition = database['lasala-control-items-v1']['e2e-source-high-row-8'].posManual;
  expect(savedPosition).toBeGreaterThan(database['lasala-control-items-v1']['e2e-target-gap-row-7'].creadoEn);

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-partidas').click();
  const reopened = page.locator('#partidas-overlay');
  await reopened.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await reopened.getByRole('button', { name: '17', exact: true }).click();
  const reopenedMap = reopened.locator('#partidas-content-wrap');
  const reopenedCard = id => reopenedMap.locator(`[ondragstart="iniciarArrastrePartida('${id}')"]`);
  const reopenedRowNumber = element => element.evaluate(node => {
    let row = node;
    while (row && row.style.minHeight !== '58px') row = row.parentElement;
    return row ? [...row.parentElement.children].indexOf(row) + 1 : null;
  });
  await expect.poll(() => reopenedRowNumber(reopenedCard('e2e-source-high-row-8'))).toBe(8);
  await expect.poll(() => reopenedRowNumber(reopenedCard('e2e-target-gap-row-7'))).toBe(7);
  expect(database['lasala-control-items-v1']['e2e-source-high-row-8'].posManual).toBe(savedPosition);
  expect(writes.length).toBeGreaterThan(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-754–755 y UAT-763: el mapa conserva cabeceras y permite abrir una tarjeta desplazada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const map = overlay.locator('#partidas-content-wrap');
  const grid = map.locator('div[style*="overflow-x:auto"]');
  const headerBands = grid.locator('div[style*="background:#dce8f5"]');
  const lastHeader = headerBands.first().locator('div').last();

  await expect.poll(() => grid.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
  await grid.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(headerBands).toHaveCount(2);
  await expect(lastHeader).toHaveText('1');
  const card = map.locator('[ondragstart="iniciarArrastrePartida(\'e2e-partida-008\')"]');
  await expect(card).toBeVisible();
  await card.getByText('E2E-PARTIDA-CALLE-1', { exact: true }).click();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toContainText('E2E-PARTIDA-CALLE-1');
  await history.getByRole('button', { name: 'Cerrar' }).click();

  await grid.evaluate(element => { element.scrollLeft = 0; });
  await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBe(0);
  await expect(headerBands.first().locator('div').first()).toHaveText('18');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-779, UAT-783 y UAT-788: mover a una calle vacía conserva identidad y persiste al reabrir', async ({ page }) => {
  const { overlay, unexpectedHosts, database, writes } = await openPartidas(page);
  const card = id => overlay.locator(`#partidas-content-wrap [ondragstart="iniciarArrastrePartida('${id}')"]`);
  const partida = database['lasala-control-items-v1']['e2e-partida-001'];
  const id = partida.id;
  const originalPartida = partida.partida;
  const originalVariedad = partida.clienteVariedad;
  const originalObservaciones = partida.observaciones;

  await card(id).locator('button[onclick^="seleccionarPartidaParaMover"]').click();
  await expect(overlay).toContainText('Seleccionada: E2E-PARTIDA-001');
  await overlay.locator('#partidas-content-wrap [onclick="clicCeldaVaciaPartidas(\'17\',2)"]').first().click();
  await expect.poll(() => database['lasala-control-items-v1'][id].tramos).toEqual([{ desde: 2, hasta: 2 }]);
  expect(database['lasala-control-items-v1'][id]).toMatchObject({
    id,
    partida: originalPartida,
    clienteVariedad: originalVariedad,
    observaciones: originalObservaciones,
    invId: '17',
    calleDesde: 2,
    calleHasta: 2
  });
  await expect(overlay.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-001', { exact: true })).toHaveCount(1);
  expect(writes.length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  const reloadedOverlay = page.locator('#partidas-overlay');
  await page.getByTestId('home-partidas').click();
  await reloadedOverlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await reloadedOverlay.getByRole('button', { name: '17', exact: true }).click();
  const reloadedCard = reloadedOverlay.locator(`#partidas-content-wrap [ondragstart="iniciarArrastrePartida('${id}')"]`);
  await expect(reloadedCard).toBeVisible();
  await expect(reloadedOverlay.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-001', { exact: true })).toHaveCount(1);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-2422: un error 5xx al guardar ubicación no confirma el movimiento ni altera otras partidas', async ({ page }) => {
  const { overlay, unexpectedHosts, database, writes } = await openPartidas(page, { failWriteStatus: 500 });
  const items = database['lasala-control-items-v1'];
  const movingBefore = structuredClone(items['e2e-partida-001']);
  const otherBefore = structuredClone(items['e2e-partida-002']);
  const card = overlay.locator(`#partidas-content-wrap [ondragstart="iniciarArrastrePartida('e2e-partida-001')"]`);

  await card.locator('button[onclick^="seleccionarPartidaParaMover"]').click();
  await expect(overlay).toContainText('Seleccionada: E2E-PARTIDA-001');
  await overlay.locator('#partidas-content-wrap [onclick="clicCeldaVaciaPartidas(\'17\',2)"]').first().click();

  await expect(page.locator('#aviso-fallo-guardado')).toContainText('El guardado remoto no se confirmó');
  await expect(page.locator('#app-toast')).not.toContainText('Partida movida');
  expect(items['e2e-partida-001']).toEqual(movingBefore);
  expect(items['e2e-partida-002']).toEqual(otherBefore);
  expect(writes.some(write => write.path.startsWith('lasala-control-items-v1'))).toBe(true);
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-786: cancelar una selección de movimiento conserva ubicación y no escribe', async ({ page }) => {
  const { overlay, unexpectedHosts, database, writes } = await openPartidas(page);
  const id = 'e2e-partida-001';
  const original = { ...database['lasala-control-items-v1'][id] };
  const card = overlay.locator(`#partidas-content-wrap [ondragstart="iniciarArrastrePartida('${id}')"]`);

  await card.locator('button[onclick^="seleccionarPartidaParaMover"]').click();
  await expect(overlay).toContainText('Seleccionada: E2E-PARTIDA-001');
  await overlay.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(overlay).not.toContainText('Seleccionada: E2E-PARTIDA-001');
  expect(database['lasala-control-items-v1'][id]).toEqual(original);
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-798: el intercambio tocar/tocar mueve ubicaciones sin duplicar ni alterar fichas', async ({ page }) => {
  const { overlay, unexpectedHosts, database, writes } = await openPartidas(page);
  const items = database['lasala-control-items-v1'];
  const first = overlay.locator('#partidas-content-wrap [ondragstart="iniciarArrastrePartida(\'e2e-partida-001\')"]');
  const second = overlay.locator('#partidas-content-wrap [ondragstart="iniciarArrastrePartida(\'e2e-partida-002\')"]');

  await first.locator('button[onclick^="seleccionarPartidaParaMover"]').click();
  await overlay.locator('#partidas-content-wrap [ondragstart="iniciarArrastrePartida(\'e2e-partida-002\')"] button[onclick^="seleccionarPartidaParaMover"]').click();
  await expect.poll(() => items['e2e-partida-001'].calleDesde).toBe(17);
  await expect.poll(() => items['e2e-partida-002'].calleDesde).toBe(18);
  expect(items['e2e-partida-001']).toMatchObject({ id: 'e2e-partida-001', partida: 'E2E-PARTIDA-001', clienteVariedad: 'Fixture variedad conocida' });
  expect(items['e2e-partida-002']).toMatchObject({ id: 'e2e-partida-002', partida: 'E2E-PARTIDA-002', clienteVariedad: 'Segunda variedad fixture' });
  await expect(overlay.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-001', { exact: true })).toHaveCount(1);
  await expect(overlay.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-002', { exact: true })).toHaveCount(1);
  expect(writes.length).toBeGreaterThan(0);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-029, UAT-776 y UAT-820: clic/teclado abren la ficha sin iniciar movimiento', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const card = overlay.locator('#partidas-content-wrap [ondragstart="iniciarArrastrePartida(\'e2e-partida-001\')"]');
  const partida = card.getByText('E2E-PARTIDA-001', { exact: true });

  await partida.click();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-PARTIDA-001');
  await expect(history).toContainText('Observación de fixture E2E');
  await history.getByRole('button', { name: 'Cerrar' }).click();
  await expect(history).toBeHidden();
  await expect(overlay).toBeVisible();
  await expect(page.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');

  await expect(card).toHaveAttribute('tabindex', '0');
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-PARTIDA-001');
  await history.getByRole('button', { name: 'Cerrar' }).click();
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-031 y UAT-744: buscar el número completo abre el historial sin cambiar los datos', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const search = overlay.getByPlaceholder('Buscar Nº partida...');

  await search.fill('E2E-PARTIDA-001');
  await search.press('Enter');
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-PARTIDA-001');
  await expect(history).toContainText('Observación de fixture E2E');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-745–746 y UAT-748: la búsqueda global localiza, informa del vacío y deja limpiar', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const search = overlay.getByPlaceholder('Buscar Nº partida...');

  await search.fill('E2E-PARTIDA-003');
  await search.press('Enter');
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-PARTIDA-003');
  await expect(history).toContainText('INV 51');
  await history.getByRole('button', { name: 'Cerrar' }).click();
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('#partidas-content-wrap')).not.toContainText('E2E-PARTIDA-003');

  await search.fill('E2E-NO-EXISTE');
  await search.press('Enter');
  await expect(page.getByText('No se ha encontrado ninguna partida con ese número')).toBeVisible();
  await expect(history).toBeHidden();

  await search.fill('');
  await search.press('Enter');
  await expect(search).toHaveValue('');
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
  await expect(overlay.locator('#partidas-content-wrap')).not.toContainText('E2E-PARTIDA-003');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-747: la búsqueda recupera una partida con salida manual sin mostrarla como presente', async ({ page }) => {
  const database = fixtureDatabase();
  database['lasala-control-items-v1'] = {
    'e2e-manual-exit-search': {
      id: 'e2e-manual-exit-search', tipo: 'tunel', dia: 57,
      partida: 'E2E-SALIDA-MANUAL-BUSCABLE', clienteVariedad: 'Fixture con salida',
      invId: '17', calleDesde: 18, calleHasta: 18, salioDesdeSemanaNumerada: 1
    }
  };
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { database });
  await overlay.getByTestId('partidas-quincena-next').click();
  const map = overlay.locator('#partidas-content-wrap');
  await expect(overlay.getByTestId('partidas-occupancy-count')).toHaveText('0');
  await expect(map).not.toContainText('E2E-SALIDA-MANUAL-BUSCABLE');

  await overlay.getByPlaceholder('Buscar Nº partida...').fill('E2E-SALIDA-MANUAL-BUSCABLE');
  await overlay.getByPlaceholder('Buscar Nº partida...').press('Enter');
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await expect(history).toContainText('E2E-SALIDA-MANUAL-BUSCABLE');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-749: la búsqueda global permanece visible y utilizable en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { selectInv: false });
  const search = overlay.getByPlaceholder('Buscar Nº partida...');
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await search.fill('E2E-PARTIDA-001');
  await search.press('Enter');
  await expect(page.locator('#partidas-historial-overlay')).toContainText('E2E-PARTIDA-001');
  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-030 y UAT-714: editar una partida de prueba persiste al recargar con la sesión restaurada', async ({ page }) => {
  const { overlay, unexpectedHosts, database } = await openPartidas(page);
  await page.locator('#partidas-content-wrap').getByText('E2E-PARTIDA-001', { exact: true }).click();
  const history = page.locator('#partidas-historial-overlay');
  await expect(history).toBeVisible();
  await history.getByRole('button', { name: 'Editar calle' }).click();

  const edit = page.locator('#control-calle-overlay');
  await expect(edit).toBeVisible();
  await edit.locator('.ac-tramo-desde').selectOption('19');
  await edit.locator('.ac-tramo-hasta').selectOption('19');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(() => database['lasala-control-items-v1']['e2e-partida-001'].tramos).toEqual([{ desde: 19, hasta: 19 }]);

  await page.reload();
  await expect(page.locator('#app')).toBeVisible();
  await page.getByTestId('home-partidas').click();
  const reloadedMap = page.locator('#partidas-overlay');
  await expect(reloadedMap).toBeVisible();
  await reloadedMap.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await reloadedMap.getByRole('button', { name: '17', exact: true }).click();
  await expect(page.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-704–705, UAT-709, UAT-717 y UAT-721: Partidas abre el selector de cinco salas sin elegir INV por defecto', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const { overlay, unexpectedHosts } = await openPartidas(page, { selectInv: false });

  for (const sala of ['Sala 1', 'Sala 2', 'Sala 3', 'Sala 4', 'Sala 5']) {
    await expect(overlay.getByRole('button', { name: sala, exact: true })).toBeVisible();
  }
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('Elige un invernadero');
  await expect(overlay.locator('#partidas-content-wrap')).not.toContainText('E2E-PARTIDA-001');
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-719–720: elegir INV de Sala 1 y Sala 5 representa el plano de cada uno', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const { overlay, unexpectedHosts } = await openPartidas(page, { selectInv: false });

  await overlay.getByRole('button', { name: 'Sala 1', exact: true }).click();
  await overlay.getByRole('button', { name: '0A', exact: true }).click();
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('INV.0-A');
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('PASILLO');

  await overlay.getByRole('button', { name: 'Sala 5', exact: true }).click();
  await overlay.getByRole('button', { name: '51', exact: true }).click();
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('INV.51');
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('PASILLO');
  await expect(overlay.locator('#partidas-content-wrap')).not.toContainText('E2E-PARTIDA-001');
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-718: cada sala lista sus invernaderos reales sin duplicados y en orden natural', async ({ page }) => {
  const { overlay, unexpectedHosts, writes } = await openPartidas(page, { selectInv: false });
  const expectedByRoom = {
    'Sala 1': ['0A', '0B', '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B', '5', '7A', '7B', '8', '28', '29', '30'],
    'Sala 2': ['10A', '10B', '11A', '11B', '12', '15', '16', '17', '18', '19', '20', '21', '22'],
    'Sala 3': ['31', '32', '33', '34', '35', '36', '37'],
    'Sala 4': ['40', '41', '42', '43', '44', '45'],
    'Sala 5': ['51', '52', '53', '54', '55', '56']
  };
  const invButtons = overlay.locator('button[onclick^="seleccionarInvPartidas"]');

  for (const [room, expected] of Object.entries(expectedByRoom)) {
    await overlay.getByRole('button', { name: room, exact: true }).click();
    const actual = (await invButtons.allTextContents()).map(value => value.trim());
    expect(actual, room).toEqual(expected);
    expect(new Set(actual).size, `${room} no debe repetir INV`).toBe(actual.length);
  }

  expect(writes).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-722–725 y UAT-2392: cambiar de INV incluso entre salas desde el mapa conserva la sesión y aísla los registros', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);
  const map = overlay.locator('#partidas-content-wrap');

  await expect(map).toContainText('INV.17');
  await expect(map).toContainText('E2E-PARTIDA-001');

  // El selector de INV permanece accesible en el mapa: equivale al flujo
  // «Cambiar» descrito en la hoja y evita cerrar/reabrir Partidas.
  await overlay.getByRole('button', { name: '18', exact: true }).click();
  await expect(overlay).toBeVisible();
  await expect(map).toContainText('INV.18');
  await expect(map).not.toContainText('E2E-PARTIDA-001');
  await expect(map).not.toContainText('E2E-PARTIDA-002');

  await overlay.getByRole('button', { name: '17', exact: true }).click();
  await expect(map).toContainText('INV.17');
  await expect(map).toContainText('E2E-PARTIDA-001');
  await expect(map).toContainText('E2E-PARTIDA-002');

  await overlay.getByRole('button', { name: 'Sala 5', exact: true }).click();
  await expect(map).toContainText('Elige un invernadero');
  await overlay.getByRole('button', { name: '51', exact: true }).click();
  await expect(map).toContainText('INV.51');
  await expect(map).toContainText('E2E-PARTIDA-003');
  await expect(map).not.toContainText('E2E-PARTIDA-001');
  await expect(map).not.toContainText('E2E-PARTIDA-002');

  expect(writes).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-712: Partidas mantiene cabecera y selector utilizables en una ventana baja', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const { overlay, unexpectedHosts, writes } = await openPartidas(page);

  await expect(overlay.getByRole('button', { name: 'Sala 2', exact: true })).toBeVisible();
  await expect(overlay.getByRole('button', { name: '17', exact: true })).toBeVisible();
  await expect(overlay.getByRole('button', { name: /Cerrar/ })).toBeVisible();
  await expect(overlay.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
  await overlay.locator('#partidas-content-wrap').evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(overlay.getByRole('button', { name: 'Sala 2', exact: true })).toBeVisible();

  expect(writes).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-706, UAT-710–711 y UAT-713: cerrar y reabrir Partidas repetidamente no duplica overlays', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const { overlay, unexpectedHosts } = await openPartidas(page, { selectInv: false });

  for (let cycle = 0; cycle < 3; cycle++) {
    await expect(page.locator('#partidas-overlay')).toHaveCount(1);
    await expect(overlay).toBeVisible();
    if (cycle === 0) {
      await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
      await overlay.getByRole('button', { name: '17', exact: true }).click();
      await expect(overlay.locator('#partidas-content-wrap')).toContainText('E2E-PARTIDA-001');
    }
    await overlay.getByRole('button', { name: /Cerrar/ }).click();
    await expect(overlay).toBeHidden();
    await expect(page.locator('#page-home')).toBeVisible();
    if (cycle < 2) await page.getByTestId('home-partidas').click();
  }

  expect(pageErrors).toEqual([]);
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-032: los Específicos asociados aparecen en la partida correcta', async ({ page }) => {
  const { overlay, unexpectedHosts } = await openPartidas(page);
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '17', exact: true }).click();
  const map = page.locator('#partidas-content-wrap');

  await expect(map).toContainText('E2E-PARTIDA-001');
  await expect(map).toContainText('E2E-TRATAMIENTO');
  await expect(map).toContainText('27 jul');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-042: aplicar un Específico desde el mapa lo asocia y muestra en la partida elegida', async ({ page }) => {
  const { overlay, unexpectedHosts, database } = await openPartidas(page);
  const day = await applySpecificToPartida(page, overlay, 'e2e-partida-001', 'TC');
  const specifics = JSON.parse(database['lasala-especificos-v1']);
  const associations = JSON.parse(database['lasala-especificos-partida-v1']);

  expect(specifics['17'][day]['18'].texto).toBe('TC 1 + 17:00');
  expect(associations['e2e-partida-001']).toContainEqual(expect.objectContaining({ trat: 'TC', dosis: '1', invId: '17', dia: Number(day), calles: [18] }));
  await expect(page.locator('#partidas-content-wrap')).toContainText('TC 1');
  const otherPartida = page.locator(`#partidas-content-wrap div[ondragstart="iniciarArrastrePartida('e2e-partida-002')"]`);
  await expect(otherPartida).not.toContainText('TC 1');
  expect(unexpectedHosts).toEqual([]);
});

test('UAT-045: dos sesiones conservan Específicos asociados a partidas distintas', async ({ page, context }) => {
  const database = fixtureDatabase();
  const first = await openPartidas(page, { database, writeDelayMs: 120 });
  await page.evaluate(() => localStorage.setItem('lasala-sesion-v1', JSON.stringify({ user: 'E2E_PARTIDAS_ADMIN_2', ts: Date.now() })));
  const secondPage = await context.newPage();
  try {
    const second = await openPartidas(secondPage, { database, user: 'E2E_PARTIDAS_ADMIN_2', loginFirst: false, writeDelayMs: 120 });
    const day = await Promise.all([
      applySpecificToPartida(page, first.overlay, 'e2e-partida-001', 'TC'),
      applySpecificToPartida(secondPage, second.overlay, 'e2e-partida-002', 'MB')
    ]);
    expect(day[0]).toBe(day[1]);
    await expect.poll(() => {
      const data = JSON.parse(database['lasala-especificos-partida-v1']);
      return [data['e2e-partida-001']?.some(x => x.trat === 'TC'), data['e2e-partida-002']?.some(x => x.trat === 'MB')];
    }).toEqual([true, true]);
    await page.reload();
    await openPartidas(page, { database, loginFirst: false });
    const map = page.locator('#partidas-content-wrap');
    await expect(map).toContainText('TC 1');
    await expect(map).toContainText('MB 1');
    expect(first.unexpectedHosts).toEqual([]);
    expect(second.unexpectedHosts).toEqual([]);
  } finally {
    await secondPage.close();
  }
});

test('UAT-046: recorrer partidas seguidas mantiene cada Específico en su partida', async ({ page }) => {
  const { overlay, unexpectedHosts } = await openPartidas(page);
  await overlay.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await overlay.getByRole('button', { name: '17', exact: true }).click();
  const first = page.locator(`#partidas-content-wrap div[ondragstart="iniciarArrastrePartida('e2e-partida-001')"]`);
  const second = page.locator(`#partidas-content-wrap div[ondragstart="iniciarArrastrePartida('e2e-partida-002')"]`);

  await expect(first).toContainText('E2E-TRATAMIENTO');
  await expect(first).not.toContainText('E2E-TRATAMIENTO-OTRO');
  await expect(second).toContainText('E2E-TRATAMIENTO-OTRO');
  await expect(second).not.toContainText('E2E-TRATAMIENTO 1');
  expect(unexpectedHosts).toEqual([]);
});
