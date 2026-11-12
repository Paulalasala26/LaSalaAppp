const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
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

test('UAT-1998, UAT-2006 y UAT-2019: ADMIN abre Notificaciones y conserva la campana en Control', async ({ page }) => {
  const users = Object.fromEntries(Object.keys(roleUsers).map(user => [user, passwordHash]));
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ ...users, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({
      VIGUERAS: [{ id: 'admin-aviso-control', mensaje: 'Aviso pendiente', fecha: '10/11/2026', visto: false, leido: false }]
    })
  });

  await logInAs(page, 'VIGUERAS');
  const bell = page.locator('#topbar-notificaciones');
  const badge = page.locator('#notificaciones-vigueras-badge span[aria-label]');
  await expect(bell).toBeVisible();
  await expect(badge).toHaveCSS('background-color', 'rgb(198, 40, 40)');

  await bell.click();
  const notifications = page.locator('#notificaciones-vigueras-overlay');
  await expect(notifications).toBeVisible();
  await notifications.getByRole('button').first().click();
  await expect(notifications).toBeHidden();

  await page.getByTestId('home-control').click();
  await expect(page.locator('#control-overlay')).toBeVisible();
  await expect(bell).toBeVisible();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#quick-access-block .home-shortcut-card').filter({ hasText: /Avisos/ })).toHaveCount(0);
});

test('UAT-1997 y UAT-1998: campana ADMIN con punto rojo y navegación por teclado', async ({ page }) => {
  const users = Object.fromEntries(Object.keys(roleUsers).map(user => [user, passwordHash]));
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ ...users, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({
      VIGUERAS: [{ id: 'admin-aviso-no-leido', mensaje: 'Aviso pendiente', fecha: '10/11/2026', visto: false, leido: false }]
    })
  });

  await logInAs(page, 'VIGUERAS');
  const bell = page.locator('#topbar-notificaciones');
  const badge = page.locator('#notificaciones-vigueras-badge span[aria-label]');
  await expect(bell).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label', '1 notificaciones sin leer');
  await expect(badge).toHaveCSS('background-color', 'rgb(198, 40, 40)');
  const box = await badge.boundingBox();
  expect(box.width).toBeLessThanOrEqual(9);
  expect(box.height).toBeLessThanOrEqual(9);

  const focusByTab = async target => {
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate(el => el === document.activeElement)) return true;
    }
    return false;
  };
  expect(await focusByTab(bell)).toBe(true);
  expect(await bell.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
  await page.keyboard.press('Enter');
  const notifications = page.locator('#notificaciones-vigueras-overlay');
  await expect(notifications).toBeVisible();
  await notifications.getByRole('button').first().click();
  await expect(notifications).toBeHidden();

  const logout = page.getByRole('button', { name: 'Salir' });
  expect(await focusByTab(logout)).toBe(true);
  expect(await logout.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('UAT-1999 y UAT-2000: punto rojo solo con aviso técnico no leído', async ({ page }) => {
  const users = Object.fromEntries(Object.keys(roleUsers).map(user => [user, passwordHash]));
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ ...users, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({
      E2E_TECNICO: [{ id: 'aviso-no-leido', mensaje: 'Aviso sin leer', fecha: '10/11/2026', visto: true, leido: false, evaluacion: null }],
      VIGUERAS: []
    })
  });

  await logInAs(page, 'E2E_TECNICO');
  const tecnicoBadge = page.locator('#avisos-tecnico-badge span[aria-label]');
  await expect(tecnicoBadge).toHaveAttribute('aria-label', '1 avisos sin leer');
  await expect(tecnicoBadge).toHaveCSS('background-color', 'rgb(198, 40, 40)');

  await page.getByRole('button', { name: 'Salir' }).click();
  await logInAs(page, 'VIGUERAS');
  await expect(page.locator('#topbar-notificaciones')).toBeVisible();
  await expect(page.locator('#notificaciones-vigueras-badge span')).toHaveCount(0);
});

test('UAT-1989, UAT-1990, UAT-1991 y UAT-1992: campana junto a logout para ADMIN y TÉCNICO', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, E2E_TECNICO: passwordHash, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' })
  });

  const assertBellAndLogout = async (bellSelector) => {
    const bell = page.locator(bellSelector);
    const logout = page.getByRole('button', { name: 'Salir' });
    await expect(bell).toBeVisible();
    await expect(logout).toBeVisible();
    const order = await page.evaluate(selector => {
      const bellRect = document.querySelector(selector).getBoundingClientRect();
      const logoutRect = document.querySelector('.logout-btn').getBoundingClientRect();
      return bellRect.right <= logoutRect.left;
    }, bellSelector);
    expect(order).toBe(true);
    await logout.click();
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
  };

  await logInAs(page, 'VIGUERAS');
  await assertBellAndLogout('#topbar-notificaciones');

  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#topbar-notificaciones')).toHaveCount(0);
  await assertBellAndLogout('#topbar-avisos');
});

test('UAT-1983, UAT-1984, UAT-1985 y UAT-2162: marca visible y nombre textual', async ({ page }) => {
  await installAuthFixture(page);

  const loginLogo = page.locator('#login-screen img[alt="La Sala"]');
  await expect(loginLogo).toBeVisible();
  await expect(loginLogo).toHaveAttribute('alt', 'La Sala');
  await expect(page.locator('#login-screen h1')).toContainText('La Sala');
  expect(await page.title()).toContain('La Sala');
  expect(await loginLogo.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);

  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(favicon).toMatch(/(?:^|\/)icon-192\.png$/);
  const faviconResponse = await page.evaluate(async path => {
    const response = await fetch(path);
    return { ok: response.ok, type: response.headers.get('content-type') };
  }, favicon);
  expect(faviconResponse.ok).toBe(true);
  expect(faviconResponse.type).toContain('image/png');

  await logInAs(page, 'E2E_ADMIN');
  const homeLogo = page.locator('#app .topbar-brand img[alt="La Sala"]');
  await expect(homeLogo).toBeVisible();
  expect(await homeLogo.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
});

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

test('UAT-006, UAT-1965–1966, UAT-1972–1974 y UAT-2032–2037: cada rol recibe su Home y solo los roles permitidos ven Avisos', async ({ page }) => {
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
    if (['E2E_ADMIN', 'E2E_TECNICO'].includes(roleCase.user)) {
      await expect(page.locator('.home-shortcut-card').filter({ hasText: 'Avisos' })).toHaveCount(0);
    }
    if (['E2E_REGANTE', 'E2E_PEON', 'E2E_CARGADOR'].includes(roleCase.user)) {
      await expect(page.locator('#avisos-tecnico-badge')).toHaveCount(0);
    }
  }
});

test('UAT-1975–1979: perfiles especializados y orden de accesos en móvil', async ({ page }) => {
  await installAuthFixture(page);

  for (const [user, forbiddenCards] of [
    ['E2E_REGANTE', ['Control', 'Marcar riego', 'Avisos']],
    ['E2E_PEON', ['Control', 'Marcar riego', 'Avisos']],
    ['E2E_CARGADOR', ['Control', 'Marcar riego', 'Historial', 'Avisos']]
  ]) {
    await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
    await page.reload();
    await logInAs(page, user);
    await expect(page.locator('#app')).toBeVisible();
    for (const label of forbiddenCards) {
      await expect(page.locator('.home-shortcut-card').filter({ hasText: label })).toHaveCount(0);
    }
  }

  for (const user of ['E2E_ADMIN', 'E2E_TECNICO']) {
    await page.evaluate(() => localStorage.removeItem('lasala-sesion-v1'));
    await page.reload();
    await logInAs(page, user);
    await expect(page.locator('#page-home')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    const cards = page.locator('.home-shortcut-card:visible');
    const desktopLabels = await cards.evaluateAll(elements => elements.map(el => el.innerText.trim().replace(/\\s+/g, ' ')));

    await page.setViewportSize({ width: 320, height: 760 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const mobileCards = await cards.evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { label: el.innerText.trim().replace(/\\s+/g, ' '), x: rect.x, right: rect.right, y: rect.y };
    }));
    expect(mobileCards.map(card => card.label)).toEqual(desktopLabels);
    expect([...mobileCards].sort((a, b) => a.y - b.y || a.x - b.x).map(card => card.label)).toEqual(desktopLabels);
    expect(mobileCards.every(card => card.x >= 0 && card.right <= 320)).toBe(true);
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

test('UAT-007, UAT-1949, UAT-1951–1953, UAT-1954–1960 y UAT-1963: los accesos de Inicio abren y cierran el módulo previsto', async ({ page }) => {
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
    ['especificos', '#especificos-overlay'],
    ['control', '#control-overlay'],
    ['partidas', '#partidas-overlay'],
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

test('UAT-1950, UAT-1967, UAT-2007, UAT-2008 y UAT-2016–2018: navegar y reabrir módulos conserva Home y Avisos', async ({ page }) => {
  const avisos = [{ id: 'aviso-sin-leer', mensaje: 'Pendiente de consulta', fecha: '04/11/2026', visto: true, leido: false, evaluacion: null }];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');
  const homeCards = page.locator('#quick-access-block .home-shortcut-card:visible');
  const initialHomeOrder = await homeCards.evaluateAll(elements => elements.map(el => el.innerText.trim().replace(/\\s+/g, ' ')));

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
  await expect(page.locator('#page-home')).toBeVisible();
  expect(await homeCards.evaluateAll(elements => elements.map(el => el.innerText.trim().replace(/\\s+/g, ' ')))).toEqual(initialHomeOrder);
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

test('UAT-2053: volver a consultar un problema ya leído no lo resuelve', async ({ page }) => {
  const aviso = {
    id: 'problema-ya-leido',
    mensaje: 'Problema pendiente de resolver',
    fecha: '04/11/2026',
    visto: true,
    leido: true,
    tipo: 'problema_ejecucion',
    resuelto: false,
    solucion: '',
    problemaData: { reportadoPor: 'E2E_REGANTE', problema: 'OTRO', problemaOtro: 'Prueba' }
  };
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [aviso] }) });
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
  await page.getByRole('button', { name: /Avisos/ }).click();

  const panel = page.locator('#avisos-tecnico-overlay');
  await expect(panel).toBeVisible();
  const action = panel.locator(`[onclick="abrirEvaluarAviso('problema-ya-leido')"]`);
  await expect(action).toBeVisible();
  await action.click();

  const resolver = page.locator('#resolver-problema-overlay');
  await expect(resolver).toBeVisible();
  await expect(resolver).toContainText('Prueba');
  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO[0];
  })).toMatchObject({ id: 'problema-ya-leido', leido: true, resuelto: false, solucion: '' });
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2043 y UAT-2048: volver del detalle conserva un aviso leído y sus acciones pendientes', async ({ page }) => {
  const aviso = {
    id: 'aviso-vuelta-lista',
    mensaje: 'Aviso pendiente de consultar',
    fecha: '04/11/2026',
    visto: true,
    leido: false,
    evaluacion: null
  };
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [aviso] }) });
  await logInAs(page, 'E2E_TECNICO');
  await page.getByRole('button', { name: /Avisos/ }).click();

  const panel = page.locator('#avisos-tecnico-overlay');
  await expect(panel).toBeVisible();
  const action = panel.locator(`[onclick="abrirEvaluarAviso('aviso-vuelta-lista')"]`);
  await expect(action).toBeVisible();
  await action.click();

  const detail = page.locator('#evaluar-aviso-overlay');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Aviso pendiente de consultar');
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await expect(detail).toBeHidden();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Aviso pendiente de consultar');
  await expect(action).toBeVisible();

  await expect.poll(async () => page.evaluate(async () => {
    const value = await window.storage.get('lasala-avisos-usuario-v1');
    return JSON.parse(value.value).E2E_TECNICO[0];
  })).toMatchObject({ id: 'aviso-vuelta-lista', leido: true, evaluacion: null });
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2009, UAT-2010, UAT-2012–2014, UAT-2022, UAT-2030, UAT-2038, UAT-2039 y UAT-2045: leer un aviso no lo evalúa ni resuelve aunque falte descripción', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
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
  expect(pageErrors).toEqual([]);
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


test('UAT-1428 y UAT-2413: PEÓN ve la tarea asignada con ubicación y la inicia desde Inicio', async ({ page }) => {
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
  await expect(inline).toContainText('0A');
  await expect(inline).toContainText('1-2');

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

test('UAT-1429 y UAT-1430: una tarea activa impide iniciar la siguiente del mismo PEÓN', async ({ page }) => {
  const todayISO = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const tasks = [
    {
      id: 'e2e-uat-1429-first',
      titulo: 'E2E primera tarea 1429',
      asignadoA: 'E2E_PEON',
      origen: 'manual',
      categoria: 'manual',
      inv: '0A',
      calles: '1-2',
      fechaISO: todayISO,
      fecha: 'hoy',
      turno: 'Mañana',
      prioridad: 'normal',
      estado: 'pendiente'
    },
    {
      id: 'e2e-uat-1429-second',
      titulo: 'E2E segunda tarea 1429',
      asignadoA: 'E2E_PEON',
      origen: 'manual',
      categoria: 'manual',
      inv: '0B',
      calles: '3-4',
      fechaISO: todayISO,
      fecha: 'hoy',
      turno: 'Mañana',
      prioridad: 'normal',
      estado: 'pendiente'
    }
  ];
  const taskWrites = [];
  await page.on('request', request => {
    if (request.method() === 'PUT' && request.url().includes('/lasala-tareas-v1.json')) taskWrites.push(request);
  });
  await installAuthFixture(page, { 'lasala-tareas-v1': JSON.stringify(tasks) });
  await logInAs(page, 'E2E_PEON');
  const inline = page.locator('#peon-tareas-inline');
  await expect(inline).toContainText(tasks[0].titulo);
  await expect(inline).toContainText(tasks[1].titulo);
  const initialText = await inline.innerText();
  expect(initialText.indexOf(tasks[0].titulo)).toBeLessThan(initialText.indexOf(tasks[1].titulo));

  const startButtons = inline.getByRole('button', { name: 'Iniciar' });
  await expect(startButtons).toHaveCount(2);
  await startButtons.first().click();
  await expect.poll(() => taskWrites.length).toBe(1);
  await expect(inline).toContainText('Iniciada');
  const saved = JSON.parse(taskWrites.at(-1).postData());
  expect(saved.find(task => task.id === tasks[0].id).estado).not.toBe('pendiente');
  expect(saved.find(task => task.id === tasks[1].id).estado).toBe('pendiente');

  const secondStart = inline.getByRole('button', { name: 'Iniciar' }).last();
  await expect(secondStart).toBeDisabled();
  expect(taskWrites).toHaveLength(1);
  expect(JSON.parse(taskWrites.at(-1).postData()).find(task => task.id === tasks[1].id).estado).toBe('pendiente');
});



test('UAT-2414 y UAT-2144: PEÓN abre Mantenimiento desde Inicio y regresa sin cambios', async ({ page }) => {
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



test('UAT-1980–1982 y UAT-2143: REGANTE vuelve a su Inicio específico desde Hojas de riego', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_REGANTE');

  const reganteHome = page.locator('#page-home-inner');
  await expect(reganteHome).toContainText('Acceso de Regante');
  await page.getByRole('button', { name: 'Hojas de riego', exact: true }).click();
  const riego = page.locator('#riego-overlay');
  await expect(riego).toBeVisible();
  await riego.getByRole('button', { name: /✕/ }).last().click();
  await expect(riego).toBeHidden();
  await expect(reganteHome).toContainText('Acceso de Regante');
  await expect(reganteHome).not.toContainText('Control de Calidad');

  await page.getByRole('button', { name: 'Salir' }).click();
  await logInAs(page, 'E2E_PEON');
  await expect(page.locator('#page-home-inner')).toContainText('Mis tareas');
  await expect(page.locator('#peon-tareas-inline')).toBeVisible();
  await expect(page.locator('#quick-access-block .home-shortcut-card')).toHaveCount(0);

  await page.getByRole('button', { name: 'Salir' }).click();
  await logInAs(page, 'E2E_CARGADOR');
  const cargadorHome = page.locator('#page-home-inner');
  await expect(cargadorHome).toContainText('Acceso de Julio (Cargas)');
  await page.getByTestId('home-qc-carga').click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Carga');
  await control.getByRole('button', { name: /✕/ }).last().click();
  await expect(control).toBeHidden();
  await expect(cargadorHome).toContainText('QC Carga');
  await expect(cargadorHome).not.toContainText('Control de Calidad');
});

test('UAT-1964: volver desde Control a Inicio conserva la sesión', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#page-home')).toBeVisible();

  await page.getByTestId('home-control').click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await control.getByRole('button', { name: /✕/ }).last().click();

  await expect(control).toBeHidden();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('UAT-1969: Home sin tareas ni avisos mantiene la navegación estable', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-tareas-v1': '[]',
    'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [] })
  });
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#page-home')).toBeVisible();

  const cards = page.locator('#quick-access-block .home-shortcut-card:visible');
  const initialHomeOrder = await cards.evaluateAll(elements => elements.map(el => el.innerText.trim().replace(/\\s+/g, ' ')));
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
  await page.reload();

  await expect(page.locator('#page-home')).toBeVisible();
  expect(await cards.evaluateAll(elements => elements.map(el => el.innerText.trim().replace(/\\s+/g, ' ')))).toEqual(initialHomeOrder);
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2114: cerrar sesión desde Inicio y usar Atrás mantiene la autenticación cerrada', async ({ page }) => {
  await installAuthFixture(page);
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#topbar-avisos')).toBeVisible();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();

  await page.goBack().catch(() => null);
  await page.goForward().catch(() => null);
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#page-home')).toBeHidden();
});

test('UAT-2115: el punto de Avisos tras volver a entrar sigue el estado remoto leído', async ({ page }) => {
  const avisos = [{ id: 'uat-2115-aviso', mensaje: 'Aviso de prueba', fecha: '11/11/2026', visto: true, leido: false, evaluacion: null }];
  await installAuthFixture(page, { 'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: avisos }) });
  await logInAs(page, 'E2E_TECNICO');

  const badge = page.locator('#avisos-tecnico-badge span[aria-label]');
  await expect(badge).toHaveAttribute('aria-label', '1 avisos sin leer');
  await page.getByRole('button', { name: /Avisos/ }).click();
  await page.locator("[onclick=\"abrirEvaluarAviso('uat-2115-aviso')\"]").click();
  await expect(page.locator('#evaluar-aviso-overlay')).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => JSON.parse((await window.storage.get('lasala-avisos-usuario-v1')).value).E2E_TECNICO[0].leido)).toBe(true);
  await page.locator('#evaluar-aviso-overlay').getByRole('button', { name: 'Cerrar' }).click();
  await page.locator('#avisos-tecnico-overlay').getByRole('button', { name: /✕/ }).click();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#avisos-tecnico-badge span[aria-label]')).toHaveCount(0);
});

test('UAT-2122–2123: recargar Inicio conserva la sesión y los permisos del perfil activo', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, E2E_TECNICO: passwordHash, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({ E2E_ADMIN: [], E2E_TECNICO: [], VIGUERAS: [] })
  });
  await logInAs(page, 'VIGUERAS');

  const adminCards = page.locator('#quick-access-block .home-shortcut-card:visible');
  const initialAdminCardCount = await adminCards.count();
  await expect(page.locator('#topbar-notificaciones')).toBeVisible();
  await page.reload();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#topbar-notificaciones')).toBeVisible();
  await expect(adminCards).toHaveCount(initialAdminCardCount);

  await page.getByRole('button', { name: 'Salir' }).click();
  await logInAs(page, 'E2E_TECNICO');
  await expect(page.locator('#topbar-avisos')).toBeVisible();
  await expect(page.locator('#topbar-notificaciones')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#topbar-avisos')).toBeVisible();
  await expect(page.locator('#topbar-notificaciones')).toHaveCount(0);
  await expect(page.locator('#quick-access-block')).toContainText('Control de Calidad');
});

test('UAT-2124: tras recargar Mis tareas mantiene el Inicio de PEÓN', async ({ page }) => {
  const todayISO = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const task = {
    id: 'e2e-uat-2124-task',
    titulo: 'E2E tarea PEON UAT-2124',
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
  await installAuthFixture(page, { 'lasala-tareas-v1': JSON.stringify([task]) });
  await logInAs(page, 'E2E_PEON');

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#peon-tareas-inline')).toContainText(task.titulo);
  await page.reload();

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#page-home-inner')).toContainText('Mis tareas');
  await expect(page.locator('#peon-tareas-inline')).toContainText(task.titulo);
  await expect(page.locator('#quick-access-block .home-shortcut-card')).toHaveCount(0);
  await expect(page.locator('#page-home-inner')).not.toContainText('Acceso de Viveros');
});

test('UAT-2129: cerrar sesión limpia avisos y estado visible antes del siguiente perfil', async ({ page }) => {
  const notice = { id: 'uat-2129-notice', mensaje: 'Aviso privado del TÉCNICO', fecha: '11/11/2026', visto: true, leido: false, evaluacion: null };
  await installAuthFixture(page, {
    'lasala-avisos-usuario-v1': JSON.stringify({ E2E_TECNICO: [notice], E2E_CARGADOR: [] })
  });
  await logInAs(page, 'E2E_TECNICO');

  const badge = page.locator('#avisos-tecnico-badge span[aria-label]');
  await expect(badge).toHaveAttribute('aria-label', '1 avisos sin leer');
  await page.getByRole('button', { name: /Avisos/ }).click();
  const panel = page.locator('#avisos-tecnico-overlay');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(notice.mensaje);
  await panel.getByRole('button', { name: /✕/ }).click();

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await logInAs(page, 'E2E_CARGADOR');
  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#page-home-inner')).not.toContainText(notice.mensaje);
  await expect(page.locator('#avisos-tecnico-badge')).toHaveCount(0);
  await expect(panel).toBeHidden();
});

test('UAT-2132: ADMIN abre Control QC por primera vez y vuelve a Inicio', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const home = page.locator('#page-home');
  const control = page.locator('#control-overlay');
  await expect(home).toBeVisible();
  await page.getByTestId('home-control').click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  await expect(control).toContainText('Check Carga Injerto');
  await control.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(control).toBeHidden();
  await expect(home).toBeVisible();
  await expect(page.getByTestId('home-control')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('UAT-2134: abrir Específicos sin haber visitado Control QC', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('especificos')"]`);
  const overlay = page.locator('#especificos-overlay');
  await shortcut.click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Específicos');
  expect(pageErrors).toEqual([]);
});

test('UAT-2135: abrir La Sala en Vivo sin haber visitado Control QC', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('sala-en-vivo')"]`);
  const overlay = page.locator('#sala-en-vivo-overlay');
  await shortcut.click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('La Sala en Vivo');
  await expect(overlay.getByRole('button', { name: 'Sala 1' })).toBeVisible();
  await expect(overlay.getByRole('button', { name: 'Sala 5' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('UAT-2137: Tareas abre antes de Control sin cargar qc-v6.js', async ({ page }) => {
  let qcRequests = 0;
  const pageErrors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/qc-v6.js')) qcRequests++;
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('tareas')"]`);
  const overlay = page.locator('#tareas-overlay');
  await shortcut.click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Resumen de Tareas');
  expect(qcRequests).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('UAT-2138: Plaguicidas abre antes de Control y conserva sus acciones', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('plaguicidas')"]`);
  const overlay = page.locator('#fito-overlay');
  await shortcut.click();
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Plaguicidas');
  await expect(overlay.getByRole('button', { name: /Añadir manualmente/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('UAT-2136: Trabajos carga Control QC al entrar en Pinzar sin abrir Control', async ({ page }) => {
  let qcDataRequests = 0;
  const pageErrors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/lasala-control-items-v1.json')) qcDataRequests++;
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('trabajos')"]`);
  const overlay = page.locator('#trabajos-overlay');
  await shortcut.click();
  await expect(overlay).toBeVisible();
  await overlay.getByRole('button', { name: 'Trabajos de Mujeres' }).click();
  await overlay.locator('#trabajos-content-wrap').getByText('Pinzar', { exact: true }).click();
  await expect(overlay.locator('#trabajos-content-wrap')).toContainText('Pinzar');
  await expect(overlay.locator('#trabajos-content-wrap')).toContainText('Añadir trabajo');
  await expect.poll(() => qcDataRequests).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test('UAT-2139: volver a Control tras Partidas reutiliza una sola carga QC', async ({ page }) => {
  let qcRequests = 0;
  const pageErrors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/qc-v6.js')) qcRequests++;
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const control = page.locator('#control-overlay');
  const partidas = page.locator('#partidas-overlay');
  const controlShortcut = page.getByTestId('home-control');
  const partidasShortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('partidas')"]`);

  await controlShortcut.click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  await expect.poll(() => qcRequests).toBe(1);
  await control.getByRole('button', { name: /✕ Cerrar/ }).click();
  await expect(control).toBeHidden();

  await partidasShortcut.click();
  await expect(partidas).toBeVisible();
  await expect(page.locator('#partidas-content-wrap')).toBeVisible();
  await expect(page.locator('#partidas-content-wrap')).toContainText(/Sala|INV/i);
  await partidas.getByRole('button', { name: /✕/ }).last().click();
  await expect(partidas).toBeHidden();

  await controlShortcut.click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  expect(qcRequests).toBe(1);
  expect(await page.locator('#control-overlay').count()).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('UAT-2146: en horizontal siguen visibles logout y Avisos ADMIN dentro de un módulo', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({ VIGUERAS: [] })
  });
  await logInAs(page, 'VIGUERAS');
  await page.getByTestId('home-control').click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  const bell = page.locator('#topbar-notificaciones');
  const logout = page.locator('.logout-btn');
  await expect(bell).toBeVisible();
  await expect(logout).toBeVisible();
  const [bellBox, logoutBox] = await Promise.all([bell.boundingBox(), logout.boundingBox()]);
  expect(bellBox).not.toBeNull();
  expect(logoutBox).not.toBeNull();
  expect(bellBox.x + bellBox.width).toBeLessThanOrEqual(logoutBox.x);
});

test('UAT-2148: recargar desde Partidas recupera Inicio y los accesos permitidos', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  await page.getByTestId('home-control').click();
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await control.getByRole('button', { name: /✕ Cerrar/ }).click();
  const partidasShortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('partidas')"]`);
  await partidasShortcut.click();
  await expect(page.locator('#partidas-overlay')).toBeVisible();
  await page.reload();

  await expect(page.locator('#page-home')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.getByTestId('home-control')).toBeVisible();
  await expect(partidasShortcut).toBeVisible();
  await page.getByTestId('home-control').click();
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  expect(pageErrors).toEqual([]);
});

test('UAT-2150: doble pulsación en Control QC mantiene una sola carga y un panel', async ({ page }) => {
  let qcRequests = 0;
  const pageErrors = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/qc-v6.js')) qcRequests++;
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');

  const shortcut = page.getByTestId('home-control');
  await shortcut.evaluate(element => { element.click(); element.click(); });
  const control = page.locator('#control-overlay');
  await expect(control).toBeVisible();
  await expect(control).toContainText('Check Túnel');
  expect(await control.count()).toBe(1);
  expect(qcRequests).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('UAT-2154–2155: en móvil Avisos y Salir reciben toques independientes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  try {
    const appRoot = path.resolve(__dirname, '..', '..');
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'blob:') {
        await route.fallback();
        return;
      }
      if (url.origin !== 'http://127.0.0.1:4173') {
        if (url.hostname === firebaseHost) await route.fallback();
        else await route.abort();
        return;
      }
      const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.resolve(appRoot, `.${pathname}`);
      try {
        const contents = await fs.readFile(file);
        const ext = path.extname(file).toLowerCase();
        const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.json' ? 'application/json' : 'application/octet-stream';
        await route.fulfill({ status: 200, contentType: mime, headers: { 'Cache-Control': 'no-store' }, body: contents });
      } catch {
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
    await installAuthFixture(page, {
      'lasala-users-v1': JSON.stringify({ VIGUERAS: passwordHash }),
      'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
      'lasala-avisos-usuario-v1': JSON.stringify({
        VIGUERAS: [{ id: 'uat-2154-notice', mensaje: 'Aviso táctil', fecha: '11/11/2026', visto: false, leido: false }]
      })
    });
    await logInAs(page, 'VIGUERAS');

    const bell = page.locator('#topbar-notificaciones');
    const logout = page.locator('.logout-btn');
    await expect(bell).toBeVisible();
    await expect(logout).toBeVisible();
    const [bellBox, logoutBox] = await Promise.all([bell.boundingBox(), logout.boundingBox()]);
    expect(bellBox.width).toBeGreaterThanOrEqual(44);
    expect(bellBox.height).toBeGreaterThanOrEqual(44);
    expect(logoutBox.width).toBeGreaterThanOrEqual(44);
    expect(logoutBox.height).toBeGreaterThanOrEqual(44);

    await bell.tap();
    const notices = page.locator('#notificaciones-vigueras-overlay');
    await expect(notices).toBeVisible();
    await notices.getByRole('button').first().click();
    await expect(notices).toBeHidden();

    await logout.tap();
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#app')).toBeHidden();
    await expect(notices).toBeHidden();
  } finally {
    await context.close();
  }
});

test('UAT-2156 y UAT-2157: lista larga de Avisos llega al final en ventana estrecha', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 720 });
  const notices = Array.from({ length: 36 }, (_, index) => ({
    id: `uat-avisos-${String(index + 1).padStart(2, '0')}`,
    mensaje: `Mensaje UAT ${String(index + 1).padStart(2, '0')}`,
    fecha: '11/11/2026',
    visto: false,
    leido: false
  }));
  await installAuthFixture(page, {
    'lasala-users-v1': JSON.stringify({ VIGUERAS: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ ...roleUsers, VIGUERAS: 'ADMIN' }),
    'lasala-avisos-usuario-v1': JSON.stringify({ VIGUERAS: notices })
  });
  await logInAs(page, 'VIGUERAS');
  const bell = page.locator('#topbar-notificaciones');
  await expect(bell).toBeVisible();
  await bell.click();

  const overlay = page.locator('#notificaciones-vigueras-overlay');
  await expect(overlay).toBeVisible();
  const modal = overlay.locator(':scope > div');
  const dimensions = await modal.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(dimensions.scroll).toBeGreaterThan(dimensions.client);
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(520);

  await modal.evaluate(el => { el.scrollTop = el.scrollHeight; });
  const finalNotice = overlay.getByText('Mensaje UAT 01', { exact: true });
  await finalNotice.scrollIntoViewIfNeeded();
  await expect(finalNotice).toBeVisible();
  expect(await modal.evaluate(el => Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight)).toBe(true);
  await expect(overlay.getByRole('button').first()).toBeVisible();
});

test('UAT-2160 y UAT-2166: Inicio y salir funcionan con teclado en tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await installAuthFixture(page);
  await logInAs(page, 'E2E_ADMIN');
  const cards = page.locator('#quick-access-block .home-shortcut-card[onclick]');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
  for (const card of await cards.all()) {
    await expect(card).toHaveAttribute('role', 'button');
    await expect(card).toHaveAttribute('tabindex', '0');
  }
  const first = cards.first();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  let focused = false;
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    if (await first.evaluate(el => el === document.activeElement)) {
      focused = true;
      break;
    }
  }
  expect(focused).toBe(true);
  expect(await first.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#riego-overlay')).toBeVisible();

  const logout = page.locator('.logout-btn');
  await expect(logout).toBeVisible();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  let logoutFocused = false;
  for (let i = 0; i < 32; i++) {
    await page.keyboard.press('Tab');
    if (await logout.evaluate(el => el === document.activeElement)) {
      logoutFocused = true;
      break;
    }
  }
  expect(logoutFocused).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('UAT-2163: botones de evaluación siguen accesibles con zoom equivalente al 200%', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthFixture(page, {
    'lasala-avisos-usuario-v1': JSON.stringify({
      E2E_TECNICO: [{ id: 'uat-2163-aviso', mensaje: 'Aviso de evaluación', fecha: '11/11/2026', evaluacion: null, observaciones: '', visto: true, leido: false }]
    })
  });
  await logInAs(page, 'E2E_TECNICO');
  await page.locator('#topbar-avisos').click();
  const notices = page.locator('#avisos-tecnico-overlay');
  await expect(notices).toBeVisible();
  await notices.getByText('Aviso de evaluación', { exact: true }).click();
  const evaluation = page.locator('#evaluar-aviso-overlay');
  await expect(evaluation).toBeVisible();

  // 195×422 CSS px equivale al viewport útil de un móvil 390×844 al 200%.
  await page.setViewportSize({ width: 195, height: 422 });
  const bien = evaluation.locator('#ea-bien');
  const mal = evaluation.locator('#ea-mal');
  await bien.scrollIntoViewIfNeeded();
  await mal.scrollIntoViewIfNeeded();
  await expect(bien).toBeVisible();
  await expect(mal).toBeVisible();
  for (const button of [bien, mal]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(195);
  }
  await expect(evaluation.locator('#ea-obs')).toBeVisible();
});

test('UAT-2164: Avisos conserva su contenido al girar el móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthFixture(page, {
    'lasala-avisos-usuario-v1': JSON.stringify({
      E2E_TECNICO: [{ id: 'uat-2164-aviso', mensaje: 'Aviso tras rotación', fecha: '11/11/2026', evaluacion: null, observaciones: '', visto: true, leido: false }]
    })
  });
  await logInAs(page, 'E2E_TECNICO');
  await page.locator('#topbar-avisos').click();
  const notices = page.locator('#avisos-tecnico-overlay');
  await expect(notices).toBeVisible();
  await expect(notices).toContainText('Aviso tras rotación');

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(notices).toBeVisible();
  await expect(notices.getByText('Aviso tras rotación', { exact: true })).toBeVisible();
  await expect(notices.getByRole('button').first()).toBeVisible();
});

test('UAT-2167: Avisos no presenta una bandeja vacía mientras carga lento', async ({ page }) => {
  await installAuthFixture(page, {
    'lasala-avisos-usuario-v1': JSON.stringify({
      E2E_TECNICO: [{ id: 'uat-2167-aviso', mensaje: 'Aviso recibido tras la espera', fecha: '11/11/2026', evaluacion: null, observaciones: '', visto: true, leido: false }],
      E2E_ADMIN: [{ id: 'uat-2167-privado', mensaje: 'Aviso de otro perfil', fecha: '11/11/2026', visto: true, leido: false }]
    })
  });
  await logInAs(page, 'E2E_TECNICO');
  await page.route(/lasala-avisos-usuario-v1\.json/, async route => {
    if (route.request().method() === 'GET') await new Promise(resolve => setTimeout(resolve, 700));
    await route.fallback();
  });

  const start = Date.now();
  await page.locator('#topbar-avisos').click();
  const notices = page.locator('#avisos-tecnico-overlay');
  await page.waitForTimeout(100);
  await expect(notices).toBeHidden();
  await expect(notices).toBeVisible();
  await expect(notices).toContainText('Aviso recibido tras la espera');
  await expect(notices).not.toContainText('Aviso de otro perfil');
  expect(Date.now() - start).toBeGreaterThanOrEqual(700);
});
