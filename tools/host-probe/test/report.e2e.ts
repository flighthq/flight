import { browser } from '@wdio/globals';

describe('host adapter', () => {
  it('publishes a passing structured report', async () => {
    await browser.waitUntil(
      async () => (await browser.execute(() => window.__flightHostProbeReport?.status)) !== undefined,
      { interval: 100, timeout: 30_000, timeoutMsg: 'host probe did not publish a report' },
    );
    const report = await browser.execute(() => window.__flightHostProbeReport);
    if (report?.status !== 'pass') throw new Error(`Host probe failed:\n${JSON.stringify(report, null, 2)}`);
    process.stdout.write(`${report.host} host probe passed (${report.results.length} results)\n`);
  });
});
