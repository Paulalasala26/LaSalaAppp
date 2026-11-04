const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..', '..');
const appOrigin = 'http://127.0.0.1:4173';
const firebaseHost = 'la-sala-app-default-rtdb.europe-west1.firebasedatabase.app';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== appOrigin) {
        if (url.hostname === firebaseHost) await route.fallback();
        else await route.abort();
        return;
      }

      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(appRoot, `.${pathname}`);
      if (file !== appRoot && !file.startsWith(appRoot + path.sep)) {
        await route.fulfill({ status: 403, body: 'Forbidden' });
        return;
      }

      try {
        const contents = await fs.readFile(file);
        await route.fulfill({
          status: 200,
          contentType: mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
          headers: { 'Cache-Control': 'no-store' },
          body: contents
        });
      } catch {
        await route.fulfill({ status: 404, body: 'Not found' });
      }
    });
    await use(page);
  }
});

module.exports = { test, expect };
