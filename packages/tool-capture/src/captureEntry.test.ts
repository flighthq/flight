import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCaptureObserveDiagnostics,
  captureEntry,
  captureParallel,
  captureUrl,
  getCaptureOutputPaths,
  isTransientCaptureError,
  isRejectedCaptureBaselineHash,
  isVerifiedCaptureTool,
} from './captureEntry';

describe('buildCaptureObserveDiagnostics', () => {
  it('passes through the render facts and separates page exceptions from console/network errors', () => {
    const d = buildCaptureObserveDiagnostics({
      backend: 'webgl',
      blank: true,
      coverage: 0,
      verifyPublished: false,
      verifyTargetKind: 'webgl',
      warmupFrames: 3,
      logs: [
        { level: 'pageerror', data: { msg: 'boom' } },
        { level: 'error', channel: 'network', data: { msg: 'request failed' } },
        { level: 'error', channel: 'console', data: { msg: 'console.error' } },
        { level: 'info', data: { msg: 'ignored' } },
      ],
    });
    expect(d).toEqual({
      attemptErrors: [],
      attempts: 1,
      backend: 'webgl',
      blank: true,
      coverage: 0,
      errorCount: 2,
      pageErrorCount: 1,
      pageEvidence: false,
      verifyPublished: false,
      verifyTargetKind: 'webgl',
      warmupFrames: 3,
      timedOut: false,
      usable: true,
    });
  });

  it('reports a clean non-blank observation with no errors', () => {
    const d = buildCaptureObserveDiagnostics({
      backend: 'webgl',
      blank: false,
      coverage: 0.42,
      verifyPublished: true,
      verifyTargetKind: 'webgl',
      warmupFrames: 0,
      logs: [],
    });
    expect(d.blank).toBe(false);
    expect(d.coverage).toBe(0.42);
    expect(d.pageErrorCount).toBe(0);
    expect(d.errorCount).toBe(0);
    expect(d.warmupFrames).toBe(0);
  });

  it('folds measured coverage into blank: an empty frame is blank even with no verify target', () => {
    // A scene that registered no verify target (blank=false from the screenshot path) but drew nothing
    // to the canvas (coverage 0) must still read as blank — the 2D-assets-never-loaded case.
    const empty = buildCaptureObserveDiagnostics({
      backend: 'webgl',
      blank: false,
      coverage: 0,
      verifyPublished: false,
      verifyTargetKind: null,
      warmupFrames: 0,
      logs: [],
    });
    expect(empty.blank).toBe(true);
    expect(empty.usable).toBe(false);

    // A frame with real content stays non-blank; a null coverage (unmeasured) does not force blank.
    expect(
      buildCaptureObserveDiagnostics({
        backend: 'webgl',
        blank: false,
        coverage: 0.1,
        verifyPublished: false,
        verifyTargetKind: null,
        warmupFrames: 0,
        logs: [],
      }).blank,
    ).toBe(false);
    expect(
      buildCaptureObserveDiagnostics({
        backend: 'webgl',
        blank: false,
        coverage: null,
        verifyPublished: false,
        verifyTargetKind: null,
        warmupFrames: 0,
        logs: [],
      }).blank,
    ).toBe(false);

    // Measured pixels win over the verifier: a scene the verifier never published (blank=true) but
    // whose canvas is clearly full (coverage 0.98) is NOT blank — the verify-publish false-positive.
    expect(
      buildCaptureObserveDiagnostics({
        backend: 'webgl',
        blank: true,
        coverage: 0.98,
        verifyPublished: false,
        verifyTargetKind: 'webgl',
        warmupFrames: 600,
        logs: [],
      }).blank,
    ).toBe(false);
  });
});

describe('captureEntry', () => {
  // Driving a page needs a live Playwright BrowserContext and server; that path is exercised end to end
  // by the capture:* scripts. Assert the entry point is wired.
  it('is a callable capture pass', () => {
    expect(typeof captureEntry).toBe('function');
  });
});

describe('captureParallel', () => {
  it('is a callable parallel capture pass', () => {
    expect(typeof captureParallel).toBe('function');
  });
});

describe('captureUrl', () => {
  // Drives its own headless browser against a live URL; exercised end to end by the `observe` bin.
  it('is a callable single-url observe pass', () => {
    expect(typeof captureUrl).toBe('function');
  });
});

describe('getCaptureOutputPaths', () => {
  it('derives the {outBase}/{tool}/{name}/{routeSegment}/… artifact layout', () => {
    const paths = getCaptureOutputPaths('out', 'functional', 'foo', 'flight:webgl');
    expect(isAbsolute(paths.outDir)).toBe(true);
    expect(paths.outDir.endsWith(join('functional', 'foo', 'flight-webgl'))).toBe(true);
    expect(paths.finalScreenshot).toBe(join(paths.outDir, 'screenshot.png'));
    expect(paths.tmpScreenshot).toBe(join(paths.outDir, 'screenshot.tmp.png'));
    expect(paths.finalLogs).toBe(join(paths.outDir, 'logs.jsonl'));
    expect(paths.tmpLogs).toBe(join(paths.outDir, 'logs.tmp.jsonl'));
    expect(paths.statusPath).toBe(join(paths.outDir, 'status.json'));
  });
});

describe('isRejectedCaptureBaselineHash', () => {
  it('rejects the known blank frame a software WebGPU adapter produces', () => {
    // Nearly committed as ground truth once; the write path must refuse it without anyone looking.
    expect(isRejectedCaptureBaselineHash('a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d0')).toBe(
      true,
    );
  });

  it('accepts an ordinary hash, including one differing only in its last character', () => {
    expect(isRejectedCaptureBaselineHash('a4f2105ecdefec94c5fe749c1dc5f2fb9dd74b9832cba0afcd3434f38c0380d1')).toBe(
      false,
    );
    expect(isRejectedCaptureBaselineHash('0b7af17177ffeb0f0f88c03546a86af9a9ef9274116cb05c0d82561b5c1a51be')).toBe(
      false,
    );
  });
});

describe('isTransientCaptureError', () => {
  it('retries infrastructure failures but not deterministic render assertions', () => {
    expect(isTransientCaptureError('page.goto: Timeout 15000ms exceeded')).toBe(true);
    expect(isTransientCaptureError('Execution context was destroyed')).toBe(true);
    expect(isTransientCaptureError('[mesh] expected red, got blue')).toBe(false);
  });
});

describe('isVerifiedCaptureTool', () => {
  it('verifies the monorepo subjects whose pages register an in-page verifier', () => {
    // Examples earn this for a reason of their own: a software WebGPU adapter cannot present to the
    // swapchain, so an unverified screenshot is blank for every scene alike.
    expect(isVerifiedCaptureTool('examples')).toBe(true);
    expect(isVerifiedCaptureTool('functional')).toBe(true);
  });

  it('leaves an external subject to opt in explicitly', () => {
    // External pages may not register a target; defaulting them on would fail every capture waiting for
    // a verifier that never arrives.
    expect(isVerifiedCaptureTool('unknown-subject')).toBe(false);
  });
});
