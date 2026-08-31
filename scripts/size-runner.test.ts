import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import type { SizeResult } from './size-runner';
import {
  collectSizeCases,
  didSizeChecksPass,
  formatSizeResult,
  getFlightDiagnosticsSizeDelta,
  getSizeCaseKey,
  parseSizeBaselineOrigins,
  readBaseline,
} from './size-runner';

// These read the size-case declarations off disk and assert nothing that requires a bundle, so they
// belong in the ordinary suite rather than in `tools/size`, whose config exists to buy a node
// environment and a 300s timeout for real builds. The build-dependent assertions stay there.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDirectory = resolve(root, 'tools', 'size', 'fixtures');

describe('collectSizeCases', () => {
  test('collects aggregate and sprite comparator pairs for scene2d pipelines', () => {
    const pipelineKeys = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => key.startsWith('scene2d-') && key.includes('-pipeline'));
    expect(pipelineKeys).toEqual([
      'scene2d-canvas-pipeline:canvas',
      'scene2d-canvas-pipeline-sprite:canvas',
      'scene2d-gl-pipeline:webgl',
      'scene2d-gl-pipeline-sprite:webgl',
      'scene2d-wgpu-pipeline:webgpu',
      'scene2d-wgpu-pipeline-sprite:webgpu',
    ]);
  });

  test('orders the canonical release target before its diagnostics variant', () => {
    const diagnosticsCases = collectSizeCases(fixturesDirectory).filter((item) => item.name === 'flight-diagnostics');
    expect(diagnosticsCases.map((item) => item.variant)).toEqual([null, 'diagnostics']);
  });

  test('discovers dom sprite, shape, and text fixtures', () => {
    const domKeys = collectSizeCases(fixturesDirectory)
      .map(getSizeCaseKey)
      .filter((key) => key.startsWith('scene2d-dom-'));
    expect(domKeys).toEqual(['scene2d-dom-shape:dom', 'scene2d-dom-sprite:dom', 'scene2d-dom-text:dom']);
  });

  test('does not discover example packages outside the fixture directory', () => {
    const keys = collectSizeCases(fixturesDirectory).map(getSizeCaseKey);

    expect(keys).not.toContain('adjustments:canvas');
    expect(keys).not.toContain('shapes:webgl');
  });
});

function extractImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf-8');
  return [...source.matchAll(/from\s+'(@flighthq\/[^']+)'/g)].map((m) => m[1]!);
}

describe('dom fixture import structure', () => {
  test('dom-sprite imports no aggregate webHost or unrelated renderer packages', () => {
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-sprite/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers.filter((s) => s === '@flighthq/host-web')).toHaveLength(0);
    expect(specifiers).not.toContain('@flighthq/scene2d-canvas');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });

  test('dom-shape imports webCanvasRenderSurfaceCreator but not aggregate webHost', () => {
    const source = readFileSync(resolve(fixturesDirectory, 'scene2d-dom-shape/src/render.dom.ts'), 'utf-8');
    expect(source).toContain('webCanvasRenderSurfaceCreator');
    expect(source).not.toContain('webHost');
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-shape/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });

  test('dom-text imports no host-web, no texture resolver, no canvas or gpu packages', () => {
    const specifiers = extractImportSpecifiers(resolve(fixturesDirectory, 'scene2d-dom-text/src/render.dom.ts'));
    expect(specifiers).not.toContain('@flighthq/sdk');
    expect(specifiers).not.toContain('@flighthq/host-web');
    expect(specifiers).not.toContain('@flighthq/texture');
    expect(specifiers).not.toContain('@flighthq/image');
    expect(specifiers).not.toContain('@flighthq/scene2d-canvas');
    expect(specifiers).not.toContain('@flighthq/scene2d-gl');
    expect(specifiers).not.toContain('@flighthq/scene2d-wgpu');
  });
});

describe('dedicated size fixture gate', () => {
  test('both baselines contain exactly the fixture corpus', () => {
    const fixtureKeys = collectSizeCases(fixturesDirectory).map(getSizeCaseKey).sort();

    for (const name of ['size.baseline.json', 'size.unminified.baseline.json']) {
      expect(Object.keys(readBaseline(resolve(fixturesDirectory, '..', name))).sort()).toEqual(fixtureKeys);
    }
  });
});

describe('didSizeChecksPass', () => {
  test('fails when no size cases were checked', () => {
    expect(didSizeChecksPass([])).toBe(false);
  });
});

describe('formatSizeResult', () => {
  test('fails a bundle of any size when no baseline exists', () => {
    expect(formatSizeResult(999_999, null)).toMatchObject({
      baselineKB: null,
      baselineKBStr: null,
      delta: null,
      passed: false,
      threshold: null,
    });
  });
});

describe('getFlightDiagnosticsSizeDelta', () => {
  // Recovered coverage, not new coverage. This was the ONE assertion deliberately left in
  // tools/size/size.test.ts because it read the BUILT results; that file was deleted wholesale when the
  // size lane was reworked, taking the only test of this export with it. Constructing the two results
  // directly needs no build, so the assertion belongs here and no longer depends on a five-minute lane.
  const sizeResult = (key: string, gzipSize: number): SizeResult => ({ gzipSize, key }) as unknown as SizeResult;

  test('reports the enabled build as a positive delta over the release stub', () => {
    const delta = getFlightDiagnosticsSizeDelta([
      sizeResult('flight-diagnostics:canvas', 1000),
      sizeResult('flight-diagnostics:canvas:diagnostics', 1750),
    ]);
    expect(delta).toBe(750);
  });

  test('reports null when either side of the pair is absent', () => {
    expect(getFlightDiagnosticsSizeDelta([sizeResult('flight-diagnostics:canvas', 1000)])).toBeNull();
    expect(getFlightDiagnosticsSizeDelta([])).toBeNull();
  });
});

describe('getSizeCaseKey', () => {
  test('uses the canonical release key plus one diagnostics suffix', () => {
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: null })).toBe(
      'flight-diagnostics:canvas',
    );
    expect(getSizeCaseKey({ name: 'flight-diagnostics', render: 'canvas', variant: 'diagnostics' })).toBe(
      'flight-diagnostics:canvas:diagnostics',
    );
  });
});

describe('parseSizeBaselineOrigins', () => {
  test('attributes every baseline key to its last committed line change', () => {
    const firstCommit = 'a'.repeat(40);
    const secondCommit = 'b'.repeat(40);
    const blame = [
      `${firstCommit} 1 1 1`,
      'author-time 1785888435',
      'author-tz -0700',
      '\t  "first:canvas": 10,',
      `${secondCommit} 2 2 1`,
      'author-time 1785974835',
      'author-tz -0700',
      '\t  "second:webgl": 20',
    ].join('\n');

    expect(parseSizeBaselineOrigins(blame)).toEqual({
      'first:canvas': { commit: firstCommit, commitDate: '2026-08-04' },
      'second:webgl': { commit: secondCommit, commitDate: '2026-08-05' },
    });
  });

  test('reports an uncommitted baseline line without inventing an origin', () => {
    const blame = [`${'0'.repeat(40)} 1 1 1`, 'author-time 1785888435', '\t  "sample:canvas": 10'].join('\n');
    expect(parseSizeBaselineOrigins(blame)).toEqual({
      'sample:canvas': { commit: null, commitDate: null },
    });
  });
});
