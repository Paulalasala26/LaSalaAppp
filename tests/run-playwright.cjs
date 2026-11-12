const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32' && process.env.USERPROFILE) {
  const expectedExecutable = chromium.executablePath();
  const revisionFolder = path.basename(path.dirname(path.dirname(expectedExecutable)));
  const executableFolder = path.basename(path.dirname(expectedExecutable));
  const cacheRoots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright'),
    path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright')
  ].filter(Boolean);
  const cacheRoot = cacheRoots.find(root => fs.existsSync(
    path.join(root, revisionFolder, executableFolder, path.basename(expectedExecutable))
  ));
  if (cacheRoot) process.env.PLAYWRIGHT_BROWSERS_PATH = cacheRoot;
}

const cli = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
