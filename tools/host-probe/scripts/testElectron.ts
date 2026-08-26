import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { _electron as electron } from '@playwright/test';
import electronPath from 'electron';

const root = resolve(import.meta.dirname, '../../..');
if (process.platform === 'linux' && process.env.DISPLAY === undefined) {
  execFileSync('xvfb-run', ['-a', 'npm', 'run', 'test:e2e:electron', '--workspace=@flighthq/tool-host-probe'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  process.exit(0);
}

execFileSync('npm', ['run', 'build:electron', '--workspace=@flighthq/tool-host-probe'], {
  cwd: root,
  stdio: 'inherit',
});

const application = await electron.launch({
  args: [resolve(import.meta.dirname, '../out/main/index.js'), '--disable-gpu', '--no-sandbox'],
  executablePath: String(electronPath),
});

try {
  const page = await application.firstWindow();
  await page.waitForFunction(() => window.__flightHostProbeReport !== undefined, undefined, { timeout: 20_000 });
  const report = await page.evaluate(() => window.__flightHostProbeReport);
  if (report?.status !== 'pass') throw new Error(`Electron host probe failed:\n${JSON.stringify(report, null, 2)}`);
  process.stdout.write(`electron host probe passed (${report.results.length} results)\n`);
} finally {
  await application.close();
}
