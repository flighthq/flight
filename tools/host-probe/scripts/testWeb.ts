import { resolve } from 'node:path';

import { chromium } from '@playwright/test';
import { createServer } from 'vite';

process.env['VITE_HOST_PROBE_HOST'] = 'web';

const server = await createServer({
  configFile: resolve(import.meta.dirname, '../vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
});

await server.listen();
const url = server.resolvedUrls?.local[0];
if (url === undefined) throw new Error('Host probe Vite server did not publish a local URL');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${url}?host=web`);
  await page.waitForFunction(() => window.__flightHostProbeReport !== undefined, undefined, { timeout: 15_000 });
  const report = await page.evaluate(() => window.__flightHostProbeReport);
  if (report?.status !== 'pass') throw new Error(`Web host probe failed:\n${JSON.stringify(report, null, 2)}`);
  process.stdout.write(`web host probe passed (${report.results.length} results)\n`);
} finally {
  await browser.close();
  await server.close();
}
