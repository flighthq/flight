// The entry-side half of the oracle-invocation record. functionalVerify owns SETTING it (two-armed
// there: invoked vs absent); this file owns CARRYING it into status.json, and specifically on the
// path where the oracle threw. That path is the whole point of the field — an oracle that ran and
// rejected the frame is the case an agent most needs to distinguish from one that never ran — and it
// is the path that discarded the record, so the failing arm below fails against the previous shape.
// The DOM fixtures additionally make the live page diverge immediately after readback, pinning that
// screenshot.png is the held verifier source rather than a later page capture.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { BrowserContext, JSHandle, Page } from '@playwright/test';
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

type DomReadbackBehavior = 'failed' | 'malformed-pass' | 'valid';

// The bridge fingerprints the exact RGBA supplied by captureDomReadback, then changes the live DOM
// before publishing PASS. The source screenshot and a later page screenshot are therefore deliberately
// different: only reusing the held source PNG can make callback fingerprint === canonical screenshot hash.
const domVerificationPage = (width: number, height: number, behavior: DomReadbackBehavior): string => `<!doctype html>
  <style>
    html, body { margin: 0; background: rgb(239, 68, 68); }
    #target { width: ${width}px; height: ${height}px; background: rgb(17, 34, 51); }
    #target span { display: block; width: 25%; height: 25%; background: rgb(250, 204, 21); }
  </style>
  <div id="target"><span></span></div>
  <script>
    const target = document.getElementById('target');
    const verification = window.__ftVerification = {
      protocolVersion: ${CAPTURE_PROTOCOL_VERSION}, render: 'dom', coverage: null, fingerprint: null,
      state: 'pending', stage: 'readingBack', error: null,
    };
    window.__ftTarget = { kind: 'dom', state: { element: target } };
    const pixelHash = async (readback) => {
      const header = new TextEncoder().encode(readback.width + 'x' + readback.height + ':');
      const payload = new Uint8Array(header.length + readback.data.length);
      payload.set(header, 0); payload.set(readback.data, header.length);
      const digest = await crypto.subtle.digest('SHA-256', payload);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    window.__ftProvideDomRenderPixels = async (readback) => {
      if (${JSON.stringify(behavior)} === 'failed') {
        verification.state = 'failed'; verification.error = '[verify:dom] element screenshot readback failed';
        return;
      }
      if (readback === null) {
        if (${JSON.stringify(behavior)} === 'malformed-pass') {
          verification.fingerprint = 'test:malformed'; verification.state = 'passed'; verification.stage = 'done';
        } else {
          verification.state = 'failed'; verification.error = '[verify:dom] no readable element pixels';
        }
        return;
      }
      const hash = await pixelHash(readback);
      target.style.background = 'rgb(34, 197, 94)';
      verification.coverage = 1; verification.fingerprint = 'test:' + hash;
      verification.state = 'passed'; verification.stage = 'done';
    };
  </script>`;

const missingDomTargetPage = `<!doctype html><script>
  window.__ftVerification = {
    protocolVersion: ${CAPTURE_PROTOCOL_VERSION}, render: 'dom', coverage: null, fingerprint: null,
    state: 'pending', stage: 'readingBack', error: null,
  };
  window.__ftProvideDomRenderPixels = () => {};
</script>`;

// Non-DOM controls publish a blue verifier image and repaint the live canvas green afterwards. Their
// canonical screenshots must remain the verifier image, pinning the existing source-selection behavior.
const rasterVerificationPage = (render: string): string => `<!doctype html>
  <canvas width="64" height="32"></canvas>
  <script>
    const canvas = document.querySelector('canvas'); const context = canvas.getContext('2d');
    context.fillStyle = 'rgb(17, 34, 51)'; context.fillRect(0, 0, canvas.width, canvas.height);
    window.__ftVerification = {
      protocolVersion: ${CAPTURE_PROTOCOL_VERSION}, render: ${JSON.stringify(render)}, coverage: 1,
      fingerprint: null, state: 'pending', stage: 'encoding', error: null,
    };
    (async () => {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const header = new TextEncoder().encode(canvas.width + 'x' + canvas.height + ':');
      const payload = new Uint8Array(header.length + pixels.length);
      payload.set(header, 0); payload.set(pixels, header.length);
      const digest = await crypto.subtle.digest('SHA-256', payload);
      const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      window.__ftRenderImage = canvas.toDataURL('image/png');
      context.fillStyle = 'rgb(34, 197, 94)'; context.fillRect(0, 0, canvas.width, canvas.height);
      Object.assign(window.__ftVerification, { fingerprint: 'test:' + hash, state: 'passed', stage: 'done' });
    })();
  </script>`;

const pages: Record<string, string> = {
  '/oracle-rejected': verificationPage('asserting', 'invoked', ORACLE_ERROR),
  '/failed-before-asserting': verificationPage('readingBack', null, READBACK_ERROR),
  '/rive-import': domVerificationPage(800, 480, 'valid'),
  '/swf-mirrored-placement': domVerificationPage(640, 300, 'valid'),
  '/dom-missing-readback': missingDomTargetPage,
  '/dom-failed-readback': domVerificationPage(80, 48, 'failed'),
  '/dom-malformed-readback': domVerificationPage(80, 48, 'malformed-pass'),
  '/dom-observe': domVerificationPage(80, 48, 'valid'),
  '/raster-canvas': rasterVerificationPage('canvas'),
  '/raster-webgl': rasterVerificationPage('webgl'),
  '/raster-webgpu': rasterVerificationPage('webgpu'),
};

interface CaptureEntryStatus {
  build: {
    commit: string | null;
    dirty: string[];
    dirtyOmitted: number;
  };
  error: string | null;
  hash: string | null;
  baselineHash: string | null;
  changed: boolean | null;
  observe?: { backend: string };
  oracle: 'absent' | 'invoked' | null;
  provenance: {
    environmentDescriptor: string | null;
    environmentId: string | null;
    hostInstanceId: string | null;
  };
  state: string;
}

function replaceDomElementScreenshot(
  context: BrowserContext,
  replacement: () => Promise<Buffer>,
): Pick<BrowserContext, 'newPage'> {
  return {
    async newPage(): Promise<Page> {
      const page = await context.newPage();
      const evaluateHandle = page.evaluateHandle.bind(page);
      Object.defineProperty(page, 'evaluateHandle', {
        configurable: true,
        value: async (...args: unknown[]): Promise<JSHandle<unknown>> => {
          const handle = (await Reflect.apply(evaluateHandle, page, args)) as JSHandle<unknown>;
          const element = handle.asElement();
          if (element !== null) {
            Object.defineProperty(element, 'screenshot', { configurable: true, value: replacement });
          }
          return handle;
        },
      });
      return page;
    },
  };
}

describe('captureEntry browser contract', () => {
  const reviewedBuild = {
    commit: 'a'.repeat(40),
    dirty: ['README.md', 'packages/effects/src/glBloomPass.ts'],
    dirtyOmitted: 47,
  } as const;
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
        build: reviewedBuild,
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

  const captureFixture = async (options: {
    name: string;
    renderer: string;
    domScreenshotReplacement?: () => Promise<Buffer>;
    staleScreenshot?: boolean;
    updateBaseline?: boolean;
    verify?: boolean;
    observe?: boolean;
  }): Promise<{
    callbackFingerprints: string[];
    screenshotPath: string;
    status: CaptureEntryStatus;
    baselineBefore: string | null;
    baselineAfter: string | null;
  }> => {
    const verify = options.verify ?? true;
    const session = await launchBrowser({ verify, observe: options.observe });
    const context =
      options.domScreenshotReplacement === undefined
        ? session.context
        : replaceDomElementScreenshot(session.context, options.domScreenshotReplacement);
    const screenshotPath = join(artifactRoot, 'functional', options.name, options.renderer, 'screenshot.png');
    const baselinePath = join(artifactRoot, 'functional', 'baselines', `${options.name}.json`);
    const baseline = `${JSON.stringify({ [options.renderer]: { sha256: 'existing-baseline' } }, null, 2)}\n`;
    mkdirSync(join(artifactRoot, 'functional', options.name, options.renderer), { recursive: true });
    if (options.staleScreenshot) writeFileSync(screenshotPath, 'stale screenshot');
    if (options.updateBaseline) {
      mkdirSync(join(artifactRoot, 'functional', 'baselines'), { recursive: true });
      writeFileSync(baselinePath, baseline);
    }
    const callbackFingerprints: string[] = [];
    try {
      await captureEntry({
        baseUrl,
        context: context as BrowserContext,
        entry: { name: options.name, renderers: [options.renderer], route: () => options.name },
        outBase: artifactRoot,
        renderers: [options.renderer],
        root: artifactRoot,
        tool: 'functional',
        updateBaseline: options.updateBaseline,
        verify,
        observe: options.observe,
        onVerifiedFingerprint: (_entry, _renderer, fingerprint) => callbackFingerprints.push(fingerprint),
      });
    } finally {
      await session.browser.close();
    }
    const statusPath = join(artifactRoot, 'functional', options.name, options.renderer, 'status.json');
    return {
      callbackFingerprints,
      screenshotPath,
      status: JSON.parse(readFileSync(statusPath, 'utf8')) as CaptureEntryStatus,
      baselineBefore: options.updateBaseline ? baseline : null,
      baselineAfter: options.updateBaseline ? readFileSync(baselinePath, 'utf8') : null,
    };
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
    // The list crosses from the dist reader through capture unchanged; it is evidence a reviewer can
    // judge, so it must not collapse to a dirty boolean/count when status.json is written.
    expect(status.build).toEqual(reviewedBuild);
    expect(status.provenance.hostInstanceId).toBeTruthy();
    expect(status.provenance.environmentId).toBeNull();
    expect(status.provenance.environmentDescriptor).toBeNull();
  }, 30_000);

  it('leaves the oracle unrecorded when the run failed before reaching the assert step', async () => {
    const status = await captureStatus('failed-before-asserting');
    expect(status.state).toBe('error');
    expect(status.error).toContain('blank render');
    expect(status.oracle).toBeNull();
  }, 30_000);

  it.each([
    ['rive-import', 800, 480],
    ['swf-mirrored-placement', 640, 300],
  ] as const)(
    'writes the exact verified DOM source for %s instead of a later page screenshot',
    async (name, width, height) => {
      const captured = await captureFixture({ name, renderer: 'dom' });
      expect(captured.status).toMatchObject({
        state: 'ready',
        error: null,
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(captured.callbackFingerprints).toEqual([`test:${captured.status.hash}`]);
      expect(existsSync(captured.screenshotPath)).toBe(true);
      const png = readFileSync(captured.screenshotPath);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width, height });
    },
    60_000,
  );

  it('fails closed when the verified DOM target is missing and removes stale canonical evidence', async () => {
    const captured = await captureFixture({
      name: 'dom-missing-readback',
      renderer: 'dom',
      staleScreenshot: true,
      updateBaseline: true,
    });
    expect(captured.status).toMatchObject({
      state: 'error',
      error: expect.stringContaining('registered DOM target or readback bridge unavailable'),
      hash: null,
      baselineHash: null,
      changed: null,
    });
    expect(captured.callbackFingerprints).toEqual([]);
    expect(existsSync(captured.screenshotPath)).toBe(false);
    expect(captured.baselineAfter).toBe(captured.baselineBefore);
  }, 30_000);

  it('fails closed when the DOM element screenshot rejects', async () => {
    const captured = await captureFixture({
      name: 'dom-failed-readback',
      renderer: 'dom',
      domScreenshotReplacement: () => Promise.reject(new Error('screenshot failed')),
      staleScreenshot: true,
      updateBaseline: true,
    });
    expect(captured.status).toMatchObject({
      state: 'error',
      error: expect.stringContaining('element screenshot readback failed'),
      hash: null,
      baselineHash: null,
      changed: null,
    });
    expect(captured.callbackFingerprints).toEqual([]);
    expect(existsSync(captured.screenshotPath)).toBe(false);
    expect(captured.baselineAfter).toBe(captured.baselineBefore);
  }, 30_000);

  it('rejects malformed verified DOM PNG bytes before publishing their fingerprint', async () => {
    const captured = await captureFixture({
      name: 'dom-malformed-readback',
      renderer: 'dom',
      domScreenshotReplacement: () => Promise.resolve(Buffer.from('not a png')),
      staleScreenshot: true,
      updateBaseline: true,
    });
    expect(captured.status).toMatchObject({
      state: 'error',
      error: expect.stringContaining('invalid element-source PNG'),
      hash: null,
      baselineHash: null,
      changed: null,
    });
    expect(captured.callbackFingerprints).toEqual([]);
    expect(existsSync(captured.screenshotPath)).toBe(false);
    expect(captured.baselineAfter).toBe(captured.baselineBefore);
  }, 30_000);

  it.each(['canvas', 'webgl', 'webgpu'] as const)(
    'preserves the verifier-image source for %s',
    async (renderer) => {
      const captured = await captureFixture({ name: `raster-${renderer}`, renderer });
      expect(captured.status).toMatchObject({
        state: 'ready',
        error: null,
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(captured.callbackFingerprints).toEqual([`test:${captured.status.hash}`]);
      expect(existsSync(captured.screenshotPath)).toBe(true);
    },
    30_000,
  );

  it('preserves the page-image fallback for unverified DOM observe captures', async () => {
    const captured = await captureFixture({ name: 'dom-observe', renderer: 'dom', observe: true, verify: false });
    expect(captured.status).toMatchObject({
      state: 'ready',
      error: null,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      observe: expect.objectContaining({ backend: 'dom' }),
    });
    expect(captured.callbackFingerprints).toEqual([]);
    expect(existsSync(captured.screenshotPath)).toBe(true);
  }, 30_000);
});
