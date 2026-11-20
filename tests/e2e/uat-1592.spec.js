const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const passwordHash = createHash('sha256').update('e2e-only-password').digest('hex');

async function installAdminFixture(page, ticket) {
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_ADMIN: passwordHash, PEON1: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_ADMIN: 'ADMIN', PEON1: 'PEON' }),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-mantenimiento-v1': JSON.stringify([ticket]),
    'lasala-historial-v1': JSON.stringify([])
  };
  const writes = [];
  const versions = new Map();
  const nextEtag = key => `"${versions.get(key) || 1}"`;
  await page.route(firebaseUrl, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== firebaseHost) return route.abort();
    const key = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
    const method = route.request().method();
    const requestHeaders = route.request().headers();
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'ETag'
    };
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
    } else if (method === 'GET') {
      const headers = { ...corsHeaders };
      if (requestHeaders['x-firebase-etag'] === 'true') headers.ETag = nextEtag(key);
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(database[key] ?? null) });
    } else if (method === 'PUT') {
      const ifMatch = requestHeaders['if-match'];
      if (ifMatch && ifMatch !== nextEtag(key)) {
        await route.fulfill({ status: 412, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ error: 'ETag mismatch' }) });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      const value = JSON.parse(route.request().postData() || 'null');
      writes.push({ key, body: route.request().postData() });
      database[key] = value;
      versions.set(key, (versions.get(key) || 1) + 1);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { ...corsHeaders, ETag: nextEtag(key) }, body: JSON.stringify(value) });
    } else {
      await route.fulfill({ status: 405, headers: corsHeaders, body: 'Method not allowed' });
    }
  });

  await page.goto('/');
  await page.locator('#login-user').evaluate((select, value) => {
    if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
  }, 'E2E_ADMIN');
  await page.locator('#login-user').selectOption('E2E_ADMIN');
  await page.locator('#login-pass').fill('e2e-only-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  return { database, writes };
}

async function openTasks(page) {
  await page.locator("#quick-access-block .home-shortcut-card[onclick=\"handleQuickAction('tareas')\"]").click();
  await expect(page.locator('#tareas-overlay')).toBeVisible();
}

test('UAT-1592: doble clic en Asignar registra una sola asignación', async ({ page }) => {
  const ticket = {
    id: 'e2e-uat1592-double-assign',
    titulo: 'UAT-1592 ticket pendiente',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: '2026-11-20'
  };
  const { database, writes } = await installAdminFixture(page, ticket);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  const card = overlay.locator('.tarea-card').filter({ hasText: ticket.titulo });
  await card.locator('.mant-persona-chk[value="PEON1"]').check();
  const confirm = overlay.locator('#mant-btn-confirmar-todas');
  await expect(confirm).toBeEnabled();
  await confirm.dblclick({ delay: 25 });
  const assignmentEvents = () => JSON.parse(database['lasala-historial-v1'] || '[]').filter(row => row.accion === 'Asignó 1 ticket(s) de mantenimiento a: PEON1');
  await expect.poll(() => assignmentEvents().length, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForTimeout(700);
  expect(assignmentEvents()).toHaveLength(1);
  const saved = JSON.parse(database['lasala-mantenimiento-v1']);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ id: ticket.id, estado: 'asignado', asignados: ['PEON1'] });
  expect(writes.some(write => write.key === 'lasala-mantenimiento-v1')).toBeTruthy();
});
