const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');

const roleUsers = {
  E2E_ADMIN: 'ADMIN',
  E2E_TECNICO: 'TECNICO',
  E2E_REGANTE: 'REGANTE',
  E2E_PEON: 'PEON',
  E2E_CARGADOR: 'CARGADOR'
};

async function installAuthFixture(page, extraDatabase = {}) {
  const database = {
    'lasala-users-v1': JSON.stringify(Object.fromEntries(Object.keys(roleUsers).map(user => [user, passwordHash]))),
    'lasala-roles-v1': JSON.stringify(roleUsers),
    ...extraDatabase
  };
  const versions = new Map();

  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) {
      await route.abort();
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    const etag = `"e2e-${versions.get(key) || 0}"`;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'ETag'
    };
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (method === 'GET') {
      const value = Object.hasOwn(database, key) ? database[key] : null;
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: etag }, body: JSON.stringify(value) });
      return;
    }
    if (method === 'PUT') {
      const ifMatch = route.request().headers()['if-match'];
      if (ifMatch && ifMatch !== etag) {
      await route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: 'null' });
        return;
      }
      database[key] = JSON.parse(route.request().postData() || 'null');
      versions.set(key, (versions.get(key) || 0) + 1);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: `"e2e-${versions.get(key)}"` }, body: JSON.stringify(database[key]) });
      return;
    }
    await route.fulfill({ status: 405, body: 'Method not allowed' });
  });

  await page.goto('/');
}

async function logInAs(page, user, pass = password) {
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) {
      select.add(new Option(value, value));
    }
  }, user);
  await page.locator('#login-user').selectOption(user);
  await page.locator('#login-pass').fill(pass);
  await page.locator('#login-btn').click();
}

test('UAT-001: credenciales válidas abren la pantalla principal', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#page-home')).toBeVisible();
});

test('UAT-002: una contraseña incorrecta no concede acceso', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN', 'incorrecta');

  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#login-alert')).toContainText('Contraseña incorrecta');
});

test('UAT-003: la sesión autenticada se restaura después de recargar', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.locator('#app')).toBeVisible();

  await page.reload();

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('UAT-004 y UAT-005: cerrar sesión y recargar mantiene la sesión cerrada', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.locator('#app')).toBeVisible();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();

  await page.reload();

  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('UAT-006, UAT-1972–1974 y UAT-2032–2037: cada rol recibe su Home y solo los roles permitidos ven Avisos', async ({ page }) => {
  await installAuthFixture(page);

  const roleCases = [
    {
      user: 'E2E_ADMIN',
      visibleText: ['Control de Riego', 'Control de Calidad', 'Historial de actividad', 'Trabajos', 'Clima', 'La Sala en Vivo'],
      hidden: []
    },
    {
      user: 'E2E_TECNICO',
      visibleText: ['Control de Riego', 'Control de Calidad'],
      hiddenCards: ['Historial', 'Trabajos', 'Clima', 'La Sala en Vivo']
    },
    {
      user: 'E2E_REGANTE',
      visibleText: ['Hojas de riego', 'Índice Abonos', 'Específicos', 'Notificar problema de ejecución'],
      hiddenCards: ['Control', 'Marcar riego', 'Avisos']
    },
    {
      user: 'E2E_PEON',
      visible: ['peon-tareas-inline'],
      hidden: ['quick-access-block'],
      hiddenCards: ['Avisos']
    },
    {
      user: 'E2E_CARGADOR',
      visibleText: ['Cargas de camión'],
      hiddenCards: ['Control', 'Marcar riego', 'Historial', 'Avisos']
    }
  ];

  for (const roleCase of roleCases) {
    await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
    await page.reload();
    await logInAs(page, roleCase.user);
    await expect(page.locator('#app')).toBeVisible();

    for (const id of roleCase.visible || []) await expect(page.locator(`#${id}`)).toBeVisible();
    for (const id of roleCase.hidden || []) await expect(page.locator(`#${id}`)).toBeHidden();
    for (const label of roleCase.visibleText || []) await expect(page.getByText(label, { exact: true })).toBeVisible();
    for (const label of roleCase.hiddenCards || []) {
      const shortcut = page.locator('.home-shortcut-card').filter({ hasText: label });
      await expect(shortcut).toBeHidden();
    }
    if (['E2E_REGANTE', 'E2E_PEON', 'E2E_CARGADOR'].includes(roleCase.user)) {
      await expect(page.locator('#avisos-tecnico-badge')).toHaveCount(0);
    }
  }
});

test('UAT-1993, UAT-1994 y UAT-1996: la cabecera conserva marca, Avisos y salida en móvil y tiene nombres accesibles', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_TECNICO');

  const brand = page.locator('.topbar-brand img');
  const avisos = page.getByRole('button', { name: /Avisos/ });
  const logout = page.getByRole('button', { name: 'Salir' });
  await expect(brand).toHaveAttribute('alt', 'La Sala');
  await expect(avisos).toBeVisible();
  await expect(logout).toBeVisible();

  for (const viewport of [{ width: 320, height: 760 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const boxes = await Promise.all([brand, avisos, logout].map(element => element.boundingBox()));
    expect(boxes.every(Boolean)).toBe(true);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(overlaps, `elementos de cabecera solapados a ${viewport.width}px`).toBe(false);
    }
  }
});

test('UAT-007, UAT-1949, UAT-1951–1953 y UAT-1954–1960: los accesos de Inicio abren y cierran el módulo previsto', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const flows = [
    ['riego', '#riego-overlay'],
    ['plaguicidas', '#fito-overlay'],
    ['historial', '#historial-overlay'],
    ['tareas', '#tareas-overlay'],
    ['clima', '#clima-overlay'],
    ['trabajos', '#trabajos-overlay'],
    ['control', '#control-overlay'],
    ['partidas', '#partidas-overlay'],
    ['especificos', '#especificos-overlay'],
    ['sala-en-vivo', '#sala-en-vivo-overlay']
  ];

  for (const [action, expectedOverlay] of flows) {
    if (action !== 'riego') await page.reload();
    const shortcut = action === 'historial'
      ? page.locator('#shortcut-historial')
      : page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('${action}')"]`);
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(page.locator(expectedOverlay)).toBeVisible();
    if (action === 'partidas') {
      await expect(page.locator('#partidas-content-wrap')).toBeVisible();
      await expect(page.locator('#partidas-content-wrap')).toContainText(/Sala|INV/i);
    }
    if (action === 'tareas') {
      await expect(page.locator(expectedOverlay)).toContainText('Resumen de Tareas');
    }
    if (action === 'especificos') {
      await expect(page.locator(expectedOverlay)).toContainText('Específicos');
    }
    if (action === 'control') {
      await expect(page.locator(expectedOverlay)).toContainText('Check Túnel');
      await expect(page.locator(expectedOverlay)).toContainText('Check Carga Injerto');
      await page.locator(expectedOverlay).getByRole('button', { name: /✕/ }).last().click();
      await expect(page.locator(expectedOverlay)).toBeHidden();
      await shortcut.click();
      await expect(page.locator(expectedOverlay)).toBeVisible();
      await expect(page.locator(expectedOverlay)).toContainText('Check Túnel');
      await expect(page.locator(expectedOverlay)).toContainText('Check Carga Injerto');
    }
    if (action === 'plaguicidas') {
      await expect(page.locator(expectedOverlay)).toContainText('Plaguicidas');
      await expect(page.locator(expectedOverlay).getByRole('button', { name: /Añadir manualmente/ })).toBeVisible();
    }
    expect(pageErrors, `Errores al abrir ${action}`).toEqual([]);
    const overlay = page.locator(expectedOverlay);
    await overlay.getByRole('button', { name: /✕/ }).last().click();
    await expect(overlay).toBeHidden();
    await expect(page.locator('#page-home')).toBeVisible();
  }
});

test('UAT-2402: salir de ADMIN y entrar como CARGADOR en la misma pestaña limpia avisos y datos administrativos', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-avisos-usuario-v1': JSON.stringify({ E2E_ADMIN: [{ id: 'admin-previo', mensaje: 'Dato administrativo anterior', visto: true, leido: false }] })
  });
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.locator('#app')).toBeVisible();
  const control = page.locator('#control-overlay');
  await page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('control')"]`).click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  await control.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(control).toBeHidden();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();

  await logInAs(page, 'E2E_CARGADOR');
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#avisos-tecnico-badge')).toHaveCount(0);
  await expect(control).toBeHidden();
  await expect(page.locator('#quick-access-block')).not.toContainText('Control de Calidad');
  await expect(page.locator('#quick-access-block')).not.toContainText('Historial');
  await expect(page.locator('#quick-access-block')).toContainText('Cargas de camión');
  await expect(page.getByText('Dato administrativo anterior', { exact: true })).toHaveCount(0);
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('UAT-2391: abrir Tareas inmediatamente después de Plaguicidas mantiene limpia la navegación', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const plaguicidas = page.locator('#fito-overlay');
  const plaguicidasShortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('plaguicidas')"]`);
  await plaguicidasShortcut.click();
  await expect(plaguicidas).toBeVisible();
  await expect(plaguicidas).toContainText('Plaguicidas');
  await plaguicidas.getByRole('button', { name: /✕/ }).last().click();
  await expect(plaguicidas).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();

  const tareas = page.locator('#tareas-overlay');
  await page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('tareas')"]`).click();
  await expect(tareas).toBeVisible();
  await expect(tareas).toContainText('Resumen de Tareas');
  await expect(tareas).not.toContainText('Plaguicidas');
  await expect(plaguicidas).toBeHidden();
  await expect(page.locator('#fito-manual-overlay')).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('UAT-707–708, UAT-1961–1962 y UAT-2408–2409: QC y Partidas abren uno después del otro sin duplicar vistas ni errores', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const controlShortcut = page.locator('#quick-access-block .home-shortcut-card[onclick="handleQuickAction(\'control\')"]');
  const partidasShortcut = page.getByTestId('home-partidas');
  const control = page.locator('#control-overlay');
  const partidas = page.locator('#partidas-overlay');

  await controlShortcut.click();
  await expect(control).toBeVisible();
  await expect(page.locator('#control-overlay')).toHaveCount(1);
  await expect(control).toContainText('Check Túnel');
  await control.getByRole('button', { name: /✕/ }).last().click();
  await expect(control).toBeHidden();

  await partidasShortcut.click();
  await expect(partidas).toBeVisible();
  await expect(page.locator('#partidas-overlay')).toHaveCount(1);
  await expect(partidas).toContainText('Elige un invernadero');
  await partidas.getByRole('button', { name: 'Sala 2', exact: true }).click();
  await partidas.getByRole('button', { name: '17', exact: true }).click();
  await partidas.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(partidas).toBeHidden();

  await controlShortcut.click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Carga Injerto');
  await control.getByRole('button', { name: /✕/ }).last().click();
  await expect(control).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('UAT-1945–1948 y UAT-1970–1971: Home conserva los nueve accesos, orden y permisos por rol', async ({ page }) => {
  await installAuthFixture(page);
  const roleOrders = [
    { user: 'E2E_ADMIN', expected: ['Control de Riego', 'Control de Calidad', 'Plaguicidas', 'Partidas', 'Específicos', 'Tareas', 'Clima', 'Trabajos', 'La Sala en Vivo'] },
    { user: 'E2E_TECNICO', expected: ['Control de Riego', 'Control de Calidad', 'Plaguicidas', 'Partidas', 'Específicos', 'Tareas'] }
  ];
  for (const role of roleOrders) {
    await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
    await page.reload();
    await logInAs(page, role.user);
    const cards = page.locator('#quick-access-block .home-shortcut-card:visible');
    await expect(cards).toHaveCount(role.expected.length);
    const labels = await cards.evaluateAll(elements =>
      elements.map(element => element.querySelector(':scope > div')?.textContent?.trim() || '')
    );
    const actions = await cards.evaluateAll(elements => elements.map(element => element.getAttribute('onclick')));

    expect(labels).toEqual(role.expected);
    expect(new Set(labels).size).toBe(role.expected.length);
    expect(actions.every(action => /^handleQuickAction\('[^']+'\)$/.test(action || ''))).toBe(true);
    expect(new Set(actions).size).toBe(role.expected.length);
  }
});

test('UAT-2001, UAT-2003 y UAT-2004: avisos leídos no muestran punto aunque sigan pendientes', async ({ page }) => {
  const avisos = [
    { id: 'aviso-leido-evaluacion', mensaje: 'Pendiente de evaluar', fecha: '04/11/2026', visto: true, leido: true, evaluacion: null },
    { id: 'aviso-leido-resolucion', mensaje: 'Pendiente de resolver', fecha: '04/11/2026', visto: true, leido: true, tipo: 'problema_ejecucion', resuelto: false }
  ];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');

  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2002, UAT-2005, UAT-2020 y UAT-2021: el punto de no leídos se recupera tras recargar', async ({ page }) => {
  const avisos = [
    { id: 'aviso-sin-leer-1', mensaje: 'Aviso sin leer 1', fecha: '04/11/2026', visto: true, leido: false, evaluacion: null },
    { id: 'aviso-sin-leer-evaluado', mensaje: 'Aviso sin leer evaluado', fecha: '04/11/2026', visto: true, leido: false, evaluacion: 'bien' }
  ];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');

  const badge = page.locator('#avisos-tecnico-badge span[aria-label]');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveAttribute('aria-label', '2 avisos sin leer');
  await expect(badge).toHaveCSS('border-radius', '50%');
  await expect(badge).toBeEmpty();

  await page.reload();
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveAttribute('aria-label', '2 avisos sin leer');
});

test('UAT-1950, UAT-2007, UAT-2008, UAT-2016–2018: navegar y reabrir módulos conserva Home y Avisos', async ({ page }) => {
  const avisos = [{ id: 'aviso-sin-leer', mensaje: 'Pendiente de consulta', fecha: '04/11/2026', visto: true, leido: false, evaluacion: null }];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');

  await page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('riego')"]`).click();
  const riego = page.locator('#riego-overlay');
  await expect(riego).toBeVisible();
  await riego.getByRole('button', { name: '✕' }).click();
  await expect(riego).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();

  const button = page.getByRole('button', { name: /Avisos/ });
  await expect(button).toBeVisible();
  await button.click();
  const panel = page.locator('#avisos-tecnico-overlay');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Pendiente de consulta');
  await panel.getByRole('button', { name: '✕' }).click();
  await expect(panel).toBeHidden();
  await button.click();
  await expect(panel).toBeVisible();
  await expect(page.locator('#avisos-tecnico-overlay')).toHaveCount(1);
  await panel.getByRole('button', { name: '✕' }).click();
  await expect(panel).toBeHidden();

  const estado = await page.evaluate(async () => JSON.parse((await window.storage.get('lasala-avisos-usuario-v1')).value).E2E_TECNICO);
  expect(estado).toHaveLength(1);
  expect(estado[0].leido).toBe(false);
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(1);
});

test('UAT-2015: Avisos vacío muestra un estado claro y no activa el punto rojo', async ({ page }) => {
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [] }) });
  await logInAs(page, 'E2E_TECNICO');

  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
  await page.getByRole('button', { name: /Avisos/ }).click();
  const panel = page.locator('#avisos-tecnico-overlay');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('No tienes avisos.');
});

test('UAT-2009, UAT-2010, UAT-2012–2014, UAT-2022, UAT-2030, UAT-2038 y UAT-2039: leer un aviso no lo evalúa ni resuelve', async ({ page }) => {
  const avisos = [
    { id: 'aviso-a', mensaje: 'Primer aviso', fecha: '04/11/2026', visto: true, leido: false, evaluacion: null },
    { id: 'aviso-b', mensaje: 'Segundo aviso', fecha: '04/11/2026', visto: true, leido: false, tipo: 'problema_ejecucion', resuelto: false, solucion: '', problemaData: { reportadoPor: 'E2E_REGANTE', problema: 'OTRO', problemaOtro: 'Prueba' } }
  ];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');
  await page.getByRole('button', { name: /Avisos/ }).click();

  await page.locator('[onclick="abrirEvaluarAviso(\'aviso-a\')"]').click();
  const detail = page.locator('#evaluar-aviso-overlay');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Primer aviso');
  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO[0];
  })).toMatchObject({ leido: true, evaluacion: null });
  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO.map(aviso => aviso.leido);
  })).toEqual([true, false]);
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveAttribute('aria-label', '1 avisos sin leer');

  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await page.locator('[onclick="abrirEvaluarAviso(\'aviso-b\')"]').click();
  const resolver = page.locator('#resolver-problema-overlay');
  await expect(resolver).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO[1];
  })).toMatchObject({ leido: true, resuelto: false, solucion: '' });
  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO.map(aviso => aviso.leido);
  })).toEqual([true, true]);
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2023, UAT-2025, UAT-2026 y UAT-2029: recuperar el foco refresca solo los avisos del usuario', async ({ page }) => {
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [], E2E_ADMIN: [] }) });
  await logInAs(page, 'E2E_TECNICO');

  await page.evaluate(async () => {
    const key = 'lasala-avisos-usuario-v1';
    const current = JSON.parse((await window.storage.get(key)).value);
    current.E2E_TECNICO = [{ id: 'foco-usuario', mensaje: 'Aviso propio', leido: false, visto: true, fecha: '04/11/2026' }];
    current.E2E_ADMIN = [{ id: 'foco-otro', mensaje: 'Aviso ajeno', leido: false, visto: true, fecha: '04/11/2026' }];
    await window.storage.set(key, JSON.stringify(current));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveAttribute('aria-label', '1 avisos sin leer');

  await page.evaluate(async () => {
    const key = 'lasala-avisos-usuario-v1';
    const current = JSON.parse((await window.storage.get(key)).value);
    current.E2E_TECNICO = [];
    current.E2E_ADMIN = [{ id: 'foco-otro', mensaje: 'Aviso ajeno', leido: false, visto: true, fecha: '04/11/2026' }];
    await window.storage.set(key, JSON.stringify(current));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2024: el refresco periódico refleja avisos nuevos sin cambiar de pantalla', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-04T10:00:00Z') });
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [], E2E_ADMIN: [] }) });
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#page-home')).toBeVisible();

  await page.evaluate(async () => {
    const key = 'lasala-avisos-usuario-v1';
    const current = JSON.parse((await window.storage.get(key)).value);
    current.E2E_TECNICO = [{ id: 'periodico-usuario', mensaje: 'Aviso nuevo', leido: false, visto: true, fecha: '04/11/2026' }];
    await window.storage.set(key, JSON.stringify(current));
  });
  await page.clock.fastForward(15001);

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveAttribute('aria-label', '1 avisos sin leer');
});

test('UAT-2027–2028: lecturas simultáneas con ETag no pierden avisos ni alteran su evaluación', async ({ page }) => {
  const avisos = [
    { id: 'concurrente-a', mensaje: 'Aviso A', leido: false, visto: true, evaluacion: null, fecha: '04/11/2026' },
    { id: 'concurrente-b', mensaje: 'Aviso B', leido: false, visto: true, evaluacion: 'mal', observaciones: 'Revisar dosis', fecha: '04/11/2026' },
    { id: 'concurrente-c', mensaje: 'Aviso C', leido: false, visto: true, tipo: 'problema_ejecucion', resuelto: false, solucion: '', fecha: '04/11/2026' }
  ];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos, E2E_ADMIN: [] }) });
  await logInAs(page, 'E2E_TECNICO');

  const primerasLecturas = await page.evaluate(() => Promise.all([
    marcarAvisoTecnicoComoLeido('concurrente-a'),
    marcarAvisoTecnicoComoLeido('concurrente-b')
  ]));
  expect(primerasLecturas).toEqual([true, true]);
  const segundasLecturas = await page.evaluate(() => Promise.all([
    marcarAvisoTecnicoComoLeido('concurrente-c'),
    marcarAvisoTecnicoComoLeido('concurrente-c')
  ]));
  expect(segundasLecturas).toEqual([true, true]);

  const guardados = await page.evaluate(async () => JSON.parse((await window.storage.get('lasala-avisos-usuario-v1')).value));
  expect(guardados.E2E_TECNICO).toHaveLength(3);
  expect(guardados.E2E_TECNICO.map(aviso => aviso.leido)).toEqual([true, true, true]);
  expect(guardados.E2E_TECNICO[1]).toMatchObject({ evaluacion: 'mal', observaciones: 'Revisar dosis' });
  expect(guardados.E2E_TECNICO[2]).toMatchObject({ tipo: 'problema_ejecucion', resuelto: false, solucion: '' });
  expect(guardados.E2E_ADMIN).toEqual([]);
});


test('UAT-2417: reabrir Partidas y Específicos varias veces no duplica vistas ni cuadrículas', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const partidas = page.locator('#partidas-overlay');
  const specificos = page.locator('#especificos-overlay');
  const partidasShortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('partidas')"]`);
  const specificosShortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('especificos')"]`);

  for (let attempt = 0; attempt < 3; attempt++) {
    await partidasShortcut.click();
    await expect(partidas).toBeVisible();
    await expect(page.locator('#partidas-overlay')).toHaveCount(1);
    await expect(page.locator('#partidas-content-wrap')).toHaveCount(1);
    if (attempt === 0) {
      await expect(partidas).toContainText('Elige un invernadero');
      await partidas.getByRole('button', { name: 'Sala 2', exact: true }).click();
      await partidas.getByRole('button', { name: '17', exact: true }).click();
    }
    await expect(page.locator('#partidas-content-wrap')).toBeVisible();
    await partidas.getByRole('button', { name: /✕ Cerrar/ }).click();
    await expect(partidas).toBeHidden();

    await specificosShortcut.click();
    await expect(specificos).toBeVisible();
    await expect(page.locator('#especificos-overlay')).toHaveCount(1);
    await expect(page.locator('#especificos-grid-wrap')).toHaveCount(1);
    await specificos.getByRole('button', { name: /✕/ }).last().click();
    await expect(specificos).toBeHidden();
  }

  expect(pageErrors).toEqual([]);
});


test('UAT-2413: PEÓN imprime su lista e inicia una tarea desde Inicio sin errores ni duplicados', async ({ page }) => {
  const todayISO = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const task = {
    id: 'e2e-uat-2413-task',
    titulo: 'E2E tarea PEON UAT-2413',
    descripcion: 'Tarea de fixture para comprobar la pantalla PEÓN',
    asignadoA: 'E2E_PEON',
    origen: 'riego',
    categoria: 'trabajo',
    inv: '0A',
    calles: '1-2',
    fechaISO: todayISO,
    fecha: 'hoy',
    turno: 'Mañana',
    prioridad: 'normal',
    estado: 'pendiente'
  };
  const pageErrors = [];
  const taskWrites = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/lasala-tareas-v1.json')) taskWrites.push(request);
  });

  await installAuthFixture(page, { 'lasala-tareas-v1': JSON.stringify([task]) });
  await logInAs(page, 'E2E_PEON');
  const inline = page.locator('#peon-tareas-inline');
  await expect(inline).toContainText(task.titulo);

  await inline.getByRole('button', { name: 'Imprimir tareas' }).click();
  const printSelector = page.locator('#imprimir-tareas-selector-overlay');
  await expect(printSelector).toBeVisible();
  await expect(printSelector).toContainText('Sala 1');
  await expect(printSelector.locator('.it-dia-chk')).toHaveCount(1);
  await printSelector.getByRole('button', { name: 'Cancelar' }).click();
  await expect(printSelector).toBeHidden();

  await inline.getByRole('button', { name: 'Iniciar' }).click();
  await expect.poll(() => taskWrites.length).toBe(1);
  await expect(inline).toContainText('Iniciada');
  await expect(inline.getByText(task.titulo, { exact: false })).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});



test('UAT-2414: PEÓN abre Mantenimiento directamente desde Inicio sin duplicar tickets ni escrituras', async ({ page }) => {
  const pageErrors = [];
  const maintenanceWrites = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/lasala-mantenimiento-v1.json')) maintenanceWrites.push(request);
  });
  const ticket = {
    id: 'e2e-uat-2414-ticket',
    titulo: 'E2E mantenimiento PEON UAT-2414',
    descripcion: 'Ticket de fixture asignado directamente',
    prioridad: 'normal',
    estado: 'asignado',
    asignados: ['E2E_PEON'],
    creadoEn: new Date().toISOString().slice(0, 10)
  };

  await installAuthFixture(page, { 'lasala-mantenimiento-v1': JSON.stringify([ticket]) });
  await logInAs(page, 'E2E_ADMIN');
  await expect(page.locator('#page-home')).toBeVisible();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await logInAs(page, 'E2E_PEON');
  await expect(page.locator('#peon-tareas-inline')).toContainText('No tienes tareas asignadas.');

  const maintenanceButton = page.locator('#btn-mantenimiento-peon');
  await expect(maintenanceButton).toBeEnabled();
  await maintenanceButton.click();
  const overlay = page.locator('#mant-peon-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText(ticket.titulo);
  await expect(overlay.locator('.tarea-card')).toHaveCount(1);
  expect(maintenanceWrites).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});



test('UAT-2416: abrir Control y Partidas a la vez comparte la carga QC y deja ambas vistas listas', async ({ page }) => {
  const pageErrors = [];
  let qcScriptRequests = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  await page.route('**/qc-v6.js', async route => {
    qcScriptRequests++;
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.fallback();
  });
  await page.evaluate(() => {
    handleQuickAction('control');
    handleQuickAction('partidas');
  });

  const control = page.locator('#control-overlay');
  const partidas = page.locator('#partidas-overlay');
  await expect(control).toBeVisible();
  await expect(partidas).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  await expect(partidas).toContainText('Elige un invernadero');
  expect(qcScriptRequests).toBe(1);
  expect(pageErrors).toEqual([]);
});

