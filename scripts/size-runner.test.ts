import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
  collectSizeCases,
  didSizeChecksPass,
  formatSizeResult,
  getSizeCaseKey,
  parseSizeBaselineOrigins,
} from './size-runner';

// These read the size-case declarations off disk and assert nothing that requires a bundle, so they
// belong in the ordinary suite rather than in `tools/size`, whose config exists to buy a node
// environment and a 300s timeout for real builds. The build-dependent assertions stay there.
const examplesDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'examples/packages');

describe('collectSizeCases', () => {
  test('orders the canonical release target before its diagnostics variant', () => {
    const diagnosticsCases = collectSizeCases(examplesDirectory).filter((item) => item.name === 'flight-diagnostics');
    expect(diagnosticsCases.map((item) => item.variant)).toEqual([null, 'diagnostics']);
  });

  test('preserves the declared renderer order', () => {
    const adjustmentCases = collectSizeCases(examplesDirectory).filter((item) => item.name === 'adjustments');
    expect(adjustmentCases.map((item) => item.render)).toEqual(['dom', 'canvas', 'webgl', 'webgpu']);
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
