const { createHash } = require('node:crypto');
const { test, expect } = require('./harness');

const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const firebaseUrl = /^https:\/\/[^/]*(?:firebasedatabase\.app|firebaseio\.com)\//;
const passwordHash = createHash('sha256').update('e2e-only-password').digest('hex');

async function installTechnicianFixture(page, ticket) {
  const database = {
    'lasala-users-v1': JSON.stringify({ E2E_TECH: passwordHash }),
    'lasala-roles-v1': JSON.stringify({ E2E_TECH: 'TECNICO' }),
    'lasala-tareas-v1': JSON.stringify([]),
    'lasala-mantenimiento-v1': JSON.stringify([ticket])
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
  }, 'E2E_TECH');
  await page.locator('#login-user').selectOption('E2E_TECH');
  await page.locator('#login-pass').fill('e2e-only-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#page-home')).toBeVisible();
  return { database, writes };
}

async function openTasks(page) {
  await page.locator("#quick-access-block .home-shortcut-card[onclick=\"handleQuickAction('tareas')\"]").click();
  await expect(page.locator('#tareas-overlay')).toBeVisible();
}

test('UAT-1668: TÉCNICO autorizado archiva y conserva autor y fecha reales', async ({ page }) => {
  const ticket = {
    id: 'e2e-uat1668-tech-archive',
    titulo: 'UAT-1668 ticket técnico',
    estado: 'sin_asignar',
    asignados: [],
    creadoEn: '2026-11-17'
  };
  const { database, writes } = await installTechnicianFixture(page, ticket);
  await openTasks(page);
  const overlay = page.locator('#tareas-overlay');
  await overlay.getByRole('button', { name: 'Mantenimiento de Parcelas' }).click();
  const card = overlay.locator(`.tarea-card[data-id="${ticket.id}"]`);
  await expect(card).toBeVisible();
  const archive = card.getByRole('button', { name: /Archivar/i });
  await expect(archive, 'TÉCNICO autorizado debe disponer de Archivar').toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await archive.click();
  await expect.poll(() => JSON.parse(database['lasala-mantenimiento-v1']).find(row => row.id === ticket.id)?.estado).toBe('archivado');
  const saved = JSON.parse(database['lasala-mantenimiento-v1']).find(row => row.id === ticket.id);
  const today = await page.evaluate(() => fechaLocalISO(new Date()));
  expect(saved).toMatchObject({ archivadoPor: 'E2E_TECH', archivadoEn: today });
  expect(writes.filter(write => write.key === 'lasala-mantenimiento-v1')).toHaveLength(1);
});
