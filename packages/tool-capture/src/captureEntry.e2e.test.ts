// The entry-side half of the oracle-invocation record. functionalVerify owns SETTING it (two-armed
// there: invoked vs absent); this file owns CARRYING it into status.json, and specifically on the
// path where the oracle threw. That path is the whole point of the field — an oracle that ran and
// rejected the frame is the case an agent most needs to distinguish from one that never ran — and it
// is the path that discarded the record, so the failing arm below fails against the previous shape.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { launchBrowser } from './captureBrowser';
import { captureEntry } from './captureEntry';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol';

// Both pages publish a terminal FAILED verification, exactly as runRenderVerification leaves the page
// when it throws. They differ only in how far the verifier got: past the assert step with the scene's
// oracle called, or short of it. Publishing the record directly (rather than bundling the real
// verifier) keeps this test about the entry's carry-through; functionalVerify.test.ts covers the
// branch that produces the value.
const verificationPage = (stage: string, oracle: string | null, error: string): string =>
  `<!doctype html><canvas width="320" height="180"></canvas><script>
    const ctx = document.querySelector('canvas').getContext('2d');
    ctx.fillStyle = '#123'; ctx.fillRect(0, 0, 320, 180);
    window.__ftVerification = {
      protocolVersion: ${CAPTURE_PROTOCOL_VERSION},
      render: 'canvas',
      coverage: 0.5,
      fingerprint: null,
      state: 'failed',
      stage: ${JSON.stringify(stage)},
      error: ${JSON.stringify(error)},
      ${oracle === null ? '' : `oracle: ${JSON.stringify(oracle)},`}
    };
  </script>`;

const ORACLE_ERROR = '[scene/canvas] no wide continuous ink run found — the stroke does not appear to be drawn';
const READBACK_ERROR = '[verify:canvas] blank render: no readable render bitmap';

const pages: Record<string, string> = {
  '/oracle-rejected': verificationPage('asserting', 'invoked', ORACLE_ERROR),
  '/failed-before-asserting': verificationPage('readingBack', null, READBACK_ERROR),
};

interface CaptureEntryStatus {
  error: string | null;
  oracle: 'absent' | 'invoked' | null;
  state: string;
}

describe('captureEntry browser contract', () => {
  const artifactRoot = mkdtempSync(join(tmpdir(), 'tool-capture-entry-'));
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(pages[(request.url ?? '').split('?')[0]] ?? 'not found');
  });
  let baseUrl = '';

  const captureStatus = async (name: string): Promise<CaptureEntryStatus> => {
    const session = await launchBrowser({ verify: true });
    try {
      await captureEntry({
        baseUrl,
        context: session.context,
        entry: { name, renderers: ['canvas'], route: () => name },
        outBase: artifactRoot,
        renderers: ['canvas'],
        root: artifactRoot,
        tool: 'functional',
        verify: true,
      });
    } finally {
      await session.browser.close();
    }
    const path = join(artifactRoot, 'functional', name, 'canvas', 'status.json');
    return JSON.parse(readFileSync(path, 'utf8')) as CaptureEntryStatus;
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('fixture server did not bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    rmSync(artifactRoot, { recursive: true, force: true });
  });

  it('records the oracle as invoked when the oracle itself rejected the frame', async () => {
    const status = await captureStatus('oracle-rejected');
    expect(status.state).toBe('error');
    expect(status.error).toContain('no wide continuous ink run');
    // The defect this pins: the error status used to hardcode null here, so a target whose oracle ran
    // and threw was indistinguishable in the artifact from one that never called an oracle at all —
    // and the artifact then said "never invoked" while carrying an error only the oracle can produce.
    expect(status.oracle).toBe('invoked');
  }, 30_000);

  it('leaves the oracle unrecorded when the run failed before reaching the assert step', async () => {
    const status = await captureStatus('failed-before-asserting');
    expect(status.state).toBe('error');
    expect(status.error).toContain('blank render');
    expect(status.oracle).toBeNull();
  }, 30_000);
});
