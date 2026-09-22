import { browser } from '@wdio/globals';
import { before } from 'mocha';

const capacitorPlatform = process.env.HOST_PROBE_CAPACITOR_PLATFORM;

// index.html carries <title>Flight Host Probe</title> statically, so the title matches as soon as the
// head is parsed — before /src/main.ts has downloaded, let alone run. Waiting on the title alone
// therefore starts the report budget at page-parse time and makes it cover module load, the lazy host
// chunks, and the probe's own work. The probe stamps hostProbeStage as its very first act, so that is
// what proves the module actually started, and what the budget below is measured from.
const PROBE_STARTED_STAGE_TIMEOUT_MILLISECONDS = 180_000;
// The probe self-reports its duration (17s on a cold iOS simulator is normal) and every other timeout
// in wdio.capacitor.conf.ts is 120s-300s. A short budget here fails green probes rather than catching
// hangs: a genuine hang is caught by the stage never reaching 'complete', not by a tight clock.
const REPORT_TIMEOUT_MILLISECONDS = 180_000;

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
              const stage = await browser.execute(() => document.documentElement.dataset.hostProbeStage ?? null);
              if (stage === null) throw new Error('Probe module has not started: no hostProbeStage stamped yet');
              return true;
            } catch (error) {
              lastFailure = error instanceof Error ? error.message : String(error);
              return false;
            }
          },
          {
            interval: 2_000,
            timeout: PROBE_STARTED_STAGE_TIMEOUT_MILLISECONDS,
            timeoutMsg: 'Capacitor WebView did not start the host probe',
          },
        );
      } catch (error) {
        // Both halves matter: the outer error says the budget expired, lastFailure says what every
        // attempt actually hit. Dropping either one is how this spec used to fail without a cause.
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Capacitor WebView did not start the host probe (${reason}). Last context error: ${lastFailure}`,
        );
      }
    });
  }

  it('publishes a passing structured report', async () => {
    const readProbeState = async () =>
      browser.execute(() => ({
        report: document.documentElement.dataset.hostProbeReport ?? null,
        stage: document.documentElement.dataset.hostProbeStage ?? null,
        status: document.documentElement.dataset.hostProbeStatus ?? null,
      }));

    // The wait is an observation budget, not the contract. Keep why it ended so a failure can say
    // whether it timed out or the page went away — a bare catch makes those two indistinguishable,
    // which is how this spec has reported "did not publish" for a report that had in fact published.
    let waitFailure: string | null = null;
    try {
      await browser.waitUntil(
        async () => {
          const { status } = await readProbeState();
          return status === 'pass' || status === 'fail';
        },
        { interval: 500, timeout: REPORT_TIMEOUT_MILLISECONDS, timeoutMsg: 'host probe did not publish a report' },
      );
    } catch (error) {
      waitFailure = error instanceof Error ? error.message : String(error);
    }

    // Re-read after the wait rather than trusting its verdict: the page is the authority on whether a
    // report exists, and a report that landed just past the budget is a slow pass, not a failure.
    const state = await readProbeState();
    if (state.status !== 'pass' && state.status !== 'fail') {
      const diagnostics = await browser.execute(() => ({
        bodyText: document.body?.innerText.slice(0, 4_000) ?? '',
        href: location.href,
        readyState: document.readyState,
        stage: document.documentElement.dataset.hostProbeStage ?? null,
        status: document.documentElement.dataset.hostProbeStatus ?? null,
        title: document.title,
      }));
      throw new Error(
        `host probe did not publish a report (wait ended: ${waitFailure ?? 'condition never met'}):\n` +
          JSON.stringify(diagnostics, null, 2),
      );
    }
    if (waitFailure !== null) {
      process.stdout.write(
        `host probe published at stage ${state.stage} only after the ${REPORT_TIMEOUT_MILLISECONDS}ms budget expired: ${waitFailure}\n`,
      );
    }

    if (state.report === null) throw new Error('host probe status was published without its structured report');
    const report = JSON.parse(state.report) as NonNullable<Window['__flightHostProbeReport']>;
    if (report?.status !== 'pass') throw new Error(`Host probe failed:\n${JSON.stringify(report, null, 2)}`);
    process.stdout.write(`${report.host} host probe passed (${report.results.length} results)\n`);
  });
});
