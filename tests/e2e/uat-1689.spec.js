const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const password = 'e2e-only-password';
const passwordHash = createHash('sha256').update(password).digest('hex');

test('UAT-1689: una lectura fallida de Mantenimiento no se presenta como lista vacía y permite recuperar', async ({ page }) => {
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ADMIN: 'ADMIN' }),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-mantenimiento-v1': JSON.stringify([{
      id: 'E2E-MANT-1689',
      titulo: 'Ticket recuperable tras error de lectura',
      descripcion: 'Fixture de lectura fallida',
      prioridad: 'media',
      estado: 'sin_asignar',
      asignados: [],
      creadoEn: '2026-06-29T09:00:00.000Z'
    }])
  };
  let maintenanceReadFailures = 1;
  const writes = [];
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'ETag'
  };

  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) {
      await route.abort();
      return;
    }
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
    } else if (method === 'GET') {
      if (key === 'lasala-mantenimiento-v1' && maintenanceReadFailures > 0) {
        maintenanceReadFailures -= 1;
        await route.fulfill({
          status: 500,
          contentType: 'text/plain',
          headers: corsHeaders,
          body: 'Simulated Firebase read failure'
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(database[key] ?? null)
      });
    } else if (method === 'PUT') {
      writes.push({ key, body: route.request().postData() });
      database[key] = JSON.parse(route.request().postData() || 'null');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(database[key])
      });
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

  const openMaintenance = async () => {
    await page.locator('#quick-access-block .home-shortcut-card[onclick="handleQuickAction(\'tareas\')"]').click();
    const overlay = page.locator('#tareas-overlay');
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: /Mantenimiento de Parcelas/ }).click();
    await expect(overlay.getByRole('heading', { name: /Mantenimiento de Parcelas/ })).toBeVisible();
    return overlay;
  };

  let overlay = await openMaintenance();
  const failureNotice = overlay.getByText(/error al cargar|no se pudieron cargar|no se pudo leer|vuelve a intentarlo|reintentar/i).first();
  const firstState = {
    failureNotice: await failureNotice.isVisible().catch(() => false),
    emptyResults: await overlay.getByTestId('mantenimiento-empty-results').isVisible().catch(() => false)
  };

  await overlay.getByRole('button', { name: 'Cerrar Operativas' }).click();
  await expect(overlay).toBeHidden();
  overlay = await openMaintenance();
  await expect(overlay).toContainText('Ticket recuperable tras error de lectura');
  const recovered = await overlay.getByText('Ticket recuperable tras error de lectura').isVisible();
  expect({
    firstState,
    recovered,
    remainingFailures: maintenanceReadFailures,
    writes
  }).toEqual({
    firstState: { failureNotice: true, emptyResults: false },
    recovered: true,
    remainingFailures: 0,
    writes: []
  });
});
