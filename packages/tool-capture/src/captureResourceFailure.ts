import type { ConsoleMessage, Page, Request } from '@playwright/test';

export function formatCaptureConsoleMessage(message: ConsoleMessage): string {
  const text = message.text();
  const url = message.location().url;
  return url === '' || text.includes(url) ? text : `${text} (${url})`;
}

export function listenForCaptureResourceFailures(page: Page, onFailure: (message: string) => void): void {
  const failedResponses = new WeakSet<Request>();

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (isCaptureTransportNoise(url)) return;
    failedResponses.add(response.request());
    const statusText = response.statusText();
    onFailure(`resource load failed: ${url} (HTTP ${status}${statusText === '' ? '' : ` ${statusText}`})`);
  });

  page.on('requestfailed', (request) => {
    if (failedResponses.has(request)) return;
    const url = request.url();
    if (isCaptureTransportNoise(url)) return;
    onFailure(`resource load failed: ${url} (${request.failure()?.errorText ?? 'unknown transport failure'})`);
  });
}

function isCaptureTransportNoise(url: string): boolean {
  return url.startsWith('ws://') || url.startsWith('wss://');
}
