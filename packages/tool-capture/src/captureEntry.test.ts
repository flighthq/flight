import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildCaptureObserveDiagnostics, captureEntry, captureParallel, getCaptureOutputPaths } from './captureEntry';

describe('buildCaptureObserveDiagnostics', () => {
  it('passes through the render facts and separates page exceptions from console/network errors', () => {
    const d = buildCaptureObserveDiagnostics({
      backend: 'webgl',
      blank: true,
      coverage: 0,
      verifyPublished: false,
      verifyTargetKind: 'webgl',
      logs: [
        { level: 'pageerror', data: { msg: 'boom' } },
        { level: 'error', channel: 'network', data: { msg: 'request failed' } },
        { level: 'error', channel: 'console', data: { msg: 'console.error' } },
        { level: 'info', data: { msg: 'ignored' } },
      ],
    });
    expect(d).toEqual({
      backend: 'webgl',
      blank: true,
      coverage: 0,
      errorCount: 2,
      pageErrorCount: 1,
      verifyPublished: false,
      verifyTargetKind: 'webgl',
    });
  });

  it('reports a clean non-blank observation with no errors', () => {
    const d = buildCaptureObserveDiagnostics({
      backend: 'webgl',
      blank: false,
      coverage: 0.42,
      verifyPublished: true,
      verifyTargetKind: 'webgl',
      logs: [],
    });
    expect(d.blank).toBe(false);
    expect(d.coverage).toBe(0.42);
    expect(d.pageErrorCount).toBe(0);
    expect(d.errorCount).toBe(0);
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
      logs: [],
    });
    expect(empty.blank).toBe(true);

    // A frame with real content stays non-blank; a null coverage (unmeasured) does not force blank.
    expect(
      buildCaptureObserveDiagnostics({
        backend: 'webgl',
        blank: false,
        coverage: 0.1,
        verifyPublished: false,
        verifyTargetKind: null,
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
