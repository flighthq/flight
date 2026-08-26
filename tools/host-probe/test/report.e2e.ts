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
    try {
      await browser.waitUntil(
        async () => {
          const status = await browser.execute(() => document.documentElement.dataset.hostProbeStatus);
          return status === 'pass' || status === 'fail';
        },
        { interval: 100, timeout: 30_000, timeoutMsg: 'host probe did not publish a report' },
      );
    } catch {
      const diagnostics = await browser.execute(() => ({
        bodyText: document.body?.innerText.slice(0, 4_000) ?? '',
        href: location.href,
        readyState: document.readyState,
        stage: document.documentElement.dataset.hostProbeStage ?? null,
        status: document.documentElement.dataset.hostProbeStatus ?? null,
        title: document.title,
      }));
      throw new Error(`host probe did not publish a report:\n${JSON.stringify(diagnostics, null, 2)}`);
    }
    const serializedReport = await browser.execute(() => document.documentElement.dataset.hostProbeReport ?? null);
    if (serializedReport === null) throw new Error('host probe status was published without its structured report');
    const report = JSON.parse(serializedReport) as NonNullable<Window['__flightHostProbeReport']>;
    if (report?.status !== 'pass') throw new Error(`Host probe failed:\n${JSON.stringify(report, null, 2)}`);
    process.stdout.write(`${report.host} host probe passed (${report.results.length} results)\n`);
  });
});
