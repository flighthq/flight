import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverReferenceEntries, runReferenceCapture, startReferenceDevServer } from './referenceCapture';

// Builds a minimal flight-reference checkout tree: content/frameworks/<framework>/<corpus>/<case>. A case
// is only discoverable when it has a Flight implementation at flight/src/app.ts.
function writeCase(root: string, framework: string, corpus: string, name: string, withApp: boolean): void {
  const caseDir = join(root, 'content', 'frameworks', framework, corpus, name);
  mkdirSync(caseDir, { recursive: true });
  if (withApp) {
    mkdirSync(join(caseDir, 'flight', 'src'), { recursive: true });
    writeFileSync(join(caseDir, 'flight', 'src', 'app.ts'), 'export {};');
  }
}

describe('discoverReferenceEntries', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'reference-capture-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns one entry per case with a Flight app, named framework/corpus/case and sorted', () => {
    writeCase(root, 'openfl', 'display', 'node-alpha', true);
    writeCase(root, 'awayjs', 'intermediate', 'md5-animation', true);

    const entries = discoverReferenceEntries(root);

    expect(entries.map((e) => e.name)).toEqual(['awayjs/intermediate/md5-animation', 'openfl/display/node-alpha']);
    expect(entries.every((e) => e.renderers.includes('webgl'))).toBe(true);
  });

  it('routes to the harness `${framework}-tests/${corpus}/${case}/flight/${renderer}/` URL', () => {
    writeCase(root, 'awayjs', 'intermediate', 'md5-animation', true);

    const [entry] = discoverReferenceEntries(root);

    expect(entry!.route?.('webgl')).toBe('awayjs-tests/intermediate/md5-animation/flight/webgl/');
    expect(entry!.route?.('flight:webgl')).toBe('awayjs-tests/intermediate/md5-animation/flight/flight-webgl/');
  });

  it('skips _shared directories and cases without a Flight app', () => {
    writeCase(root, 'openfl', 'display', '_shared', true);
    writeCase(root, 'openfl', 'display', 'starling-only', false);

    expect(discoverReferenceEntries(root)).toEqual([]);
  });

  it('returns empty when the frameworks directory is absent', () => {
    expect(discoverReferenceEntries(join(root, 'missing'))).toEqual([]);
  });
});

describe('runReferenceCapture', () => {
  // The full session starts flight-reference's Vite dev server and launches a browser, so it is exercised
  // end to end by capture:reference. Here we only assert the entry point is wired and validates input.
  it('rejects when no reference cases match', async () => {
    const root = mkdtempSync(join(tmpdir(), 'reference-capture-'));
    try {
      await expect(
        runReferenceCapture({ checkoutDir: root, repoRoot: root, outBase: join(root, 'out') }),
      ).rejects.toThrow(/No reference cases/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('startReferenceDevServer', () => {
  it('is a callable dev-server starter', () => {
    expect(typeof startReferenceDevServer).toBe('function');
  });
});
