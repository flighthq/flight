import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { captureEntry, captureParallel, getCaptureOutputPaths } from './captureEntry';

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
