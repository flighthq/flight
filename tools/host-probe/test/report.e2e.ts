import { browser } from '@wdio/globals';
import { before } from 'mocha';

const capacitorPlatform = process.env.HOST_PROBE_CAPACITOR_PLATFORM;

describe('host adapter', () => {
  if (capacitorPlatform === 'android' || capacitorPlatform === 'ios') {
    before(async () => {
      let lastFailure = 'no WebView context was reported';
      try {
        await browser.waitUntil(
          async () => {
            try {
              const contexts = await browser.getAppiumContexts();
              const webview = contexts
                .map((context) => (typeof context === 'string' ? context : context.id))
                .find((context) => context.startsWith('WEBVIEW_'));
              if (webview === undefined) throw new Error(`No WebView in contexts: ${JSON.stringify(contexts)}`);

              // WebdriverIO's metadata matcher rejects valid PID-based iOS names such as
              // WEBVIEW_16457.1 when its bundleId is absent. The raw Appium context is authoritative.
              await browser.switchAppiumContext(webview);
              const title = await browser.getTitle();
              if (!title.includes('Flight Host Probe')) throw new Error(`Unexpected WebView title: ${title}`);
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
  }

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
