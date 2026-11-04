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

async function installAuthFixture(page) {
  const database = {
    'lasala-users-v1': JSON.stringify(Object.fromEntries(Object.keys(roleUsers).map(user => [user, passwordHash]))),
    'lasala-roles-v1': JSON.stringify(roleUsers)
  };

  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) {
      await route.abort();
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const value = Object.hasOwn(database, key) ? database[key] : null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
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

test('UAT-006: cada rol recibe su acceso inicial correspondiente', async ({ page }) => {
  await installAuthFixture(page);

  const roleCases = [
    {
      user: 'E2E_ADMIN',
      visibleText: ['Marcar riego', 'Control', 'Historial', 'Trabajos', 'Clima', 'La Sala en Vivo'],
      hidden: []
    },
    {
      user: 'E2E_TECNICO',
      visibleText: ['Marcar riego', 'Control'],
      hiddenCards: ['Historial', 'Trabajos', 'Clima', 'La Sala en Vivo']
    },
    {
      user: 'E2E_REGANTE',
      visibleText: ['Hojas de riego', 'Índice Abonos', 'Específicos', 'Notificar problema de ejecución'],
      hiddenCards: ['Control', 'Marcar riego']
    },
    {
      user: 'E2E_PEON',
      visible: ['peon-tareas-inline'],
      hidden: ['quick-access-block']
    },
    {
      user: 'E2E_CARGADOR',
      visibleText: ['Cargas de camión'],
      hiddenCards: ['Control', 'Marcar riego', 'Historial']
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
  }
});

test('UAT-007: los accesos de Inicio abren el módulo correcto sin errores de JavaScript', async ({ page }) => {
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
    ['sala-en-vivo', '#sala-en-vivo-overlay']
  ];

  for (const [action, expectedOverlay] of flows) {
    if (action !== 'riego') await page.reload();
    const shortcut = page.locator(`#quick-access-block .home-shortcut-card[onclick="handleQuickAction('${action}')"]`);
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(page.locator(expectedOverlay)).toBeVisible();
    expect(pageErrors, `Errores al abrir ${action}`).toEqual([]);
  }
});
