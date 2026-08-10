import { describe, expect, test } from 'vitest';

import { didSizeChecksPass, formatSizeResult, parseSizeBaselineOrigins } from './size-runner';

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

  test('fails when no size cases were checked', () => {
    expect(didSizeChecksPass([])).toBe(false);
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
