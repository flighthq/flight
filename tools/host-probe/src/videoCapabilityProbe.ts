import './style.css';
import type { VideoCapabilityBrowserReport, VideoCapabilityBrowserResult } from './videoCapabilityProbeCore';
import { runVideoCapabilityBrowserProbe } from './videoCapabilityProbeCore';

const app = document.getElementById('app');
if (app === null) throw new Error('Video capability probe root is missing');
app.innerHTML = '<h1>Flight Video Capability Probe</h1><p id="summary">Starting…</p><ol id="results"></ol>';

let report: VideoCapabilityBrowserReport;
try {
  report = runVideoCapabilityBrowserProbe();
} catch (error) {
  report = {
    results: [createBootstrapFailure(error)],
    status: 'fail',
  };
}
publish(report);

function createBootstrapFailure(error: unknown): VideoCapabilityBrowserResult {
  return {
    actual: null,
    allocations: 0,
    detail: error instanceof Error ? error.message : String(error),
    expected: null,
    id: 'runtime.bootstrap',
    mimeType: null,
    status: 'fail',
  };
}

function publish(value: VideoCapabilityBrowserReport): void {
  window.__flightVideoCapabilityReport = value;
  document.documentElement.dataset.videoCapabilityProbeReport = JSON.stringify(value);
  document.documentElement.dataset.videoCapabilityProbeStatus = value.status;
  const summary = document.getElementById('summary');
  if (summary !== null) summary.textContent = `Video capability: ${value.status.toUpperCase()}`;
  const list = document.getElementById('results');
  if (list !== null) {
    for (const result of value.results) {
      const item = document.createElement('li');
      item.dataset.status = result.status;
      item.textContent = `${result.status.toUpperCase()} ${result.id} — ${result.detail}`;
      list.appendChild(item);
    }
  }
  window.dispatchEvent(new CustomEvent('flight-video-capability-probe-complete', { detail: value }));
}
