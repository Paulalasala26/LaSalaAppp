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
    const corsHeaders =ֻǱ˞