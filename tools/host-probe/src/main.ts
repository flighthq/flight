import { captureHostProbeBackends } from './capabilityBackends';
import { createHostProbeProviderResults } from './expectations';
import { installHostProbe, resolveHostProbeHost } from './host';
import { runHostProbeRender } from './renderProbe';
import { createHostProbeReport } from './report';
import './style.css';

const app = document.getElementById('app');
if (app === null) throw new Error('Host probe root is missing');
app.innerHTML =
  '<h1>Flight Host Probe</h1><p id="summary">Starting…</p><div id="render-target"></div><ol id="results"></ol>';

const host = resolveHostProbeHost();
document.title = `Flight Host Probe · ${host}`;
const startedAt = new Date();
const before = captureHostProbeBackends();

try {
  const installation = await installHostProbe(host, before);
  const results = [
    ...createHostProbeProviderResults(host, new Set(installation.changedCapabilities)),
    ...installation.results,
    runHostProbeRender(),
  ];
  publish(createHostProbeReport(host, startedAt, new Date(), results));
} catch (error) {
  publish(
    createHostProbeReport(host, startedAt, new Date(), [
      {
        detail: error instanceof Error ? error.message : String(error),
        id: 'runtime.bootstrap',
        kind: 'runtime',
        status: 'fail',
      },
    ]),
  );
}

function publish(report: NonNullable<Window['__flightHostProbeReport']>): void {
  window.__flightHostProbeReport = report;
  document.documentElement.dataset.hostProbeStatus = report.status;
  const summary = document.getElementById('summary');
  if (summary !== null)
    summary.textContent = `${report.host}: ${report.status.toUpperCase()} · ${report.durationMilliseconds}ms`;
  const list = document.getElementById('results');
  if (list !== null) {
    for (const result of report.results) {
      const item = document.createElement('li');
      item.dataset.status = result.status;
      item.textContent = `${result.status.toUpperCase()} ${result.id} — ${result.detail}`;
      list.appendChild(item);
    }
  }
  window.dispatchEvent(new CustomEvent('flight-host-probe-complete', { detail: report }));
}
