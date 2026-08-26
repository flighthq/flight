import { browser } from '@wdio/globals';
import { before } from 'mocha';

describe('host adapter', () => {
  before(async () => {
    let lastFailure = 'no WebView context was reported';
    try {
      await browser.waitUntil(
        async () => {
          try {
            await browser.switchContext({
              androidWebviewConnectionRetryTime: 1_000,
              androidWebviewConnectTimeout: 30_000,
              appIdentifier: 'dev.flighthq.hostprobe',
              title: 'Flight Host Probe',
            });
            return true;
          } catch (error) {
            lastFailure = error instanceof Error ? error.message : String(error);
            return false;
          }
        },
        { interval: 2_000, timeout: 180_000, timeoutMsg: 'Capacitor WebView did not become available' },
      );
    } catch {
      throw new Error(`Capacitor WebView did not become available. Last context error: ${lastFailure}`);
    }
  });

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
