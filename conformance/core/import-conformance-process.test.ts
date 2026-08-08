import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IMPORT_CONFORMANCE_FAILURE_EXIT_CODE,
  IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE,
  IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE,
  parseImportConformanceArguments,
  parseImportConformanceShardSelection,
  prepareImportConformanceScoreTarget,
  writeImportConformanceScoreAtomically,
} from './import-conformance-process';

describe('import conformance process contract', () => {
  it('uses zero for measured, one for no artifact, and two for a valid NOT RUN artifact', () => {
    expect(IMPORT_CONFORMANCE_SUCCESS_EXIT_CODE).toBe(0);
    expect(IMPORT_CONFORMANCE_FAILURE_EXIT_CODE).toBe(1);
    expect(IMPORT_CONFORMANCE_NOT_RUN_EXIT_CODE).toBe(2);
  });

  it('removes a stale score before work and atomically writes the current result', () => {
    const directory = mkdtempSync(join(tmpdir(), 'flight-conformance-process-'));
    const target = join(directory, 'score.json');
    writeFileSync(target, 'stale');
    prepareImportConformanceScoreTarget(target);
    expect(existsSync(target)).toBe(false);

    writeImportConformanceScoreAtomically(target, { state: 'not-run' });
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ state: 'not-run' });
  });
});

describe('parseImportConformanceArguments', () => {
  it('parses the exact nightly exhaustive surface', () => {
    expect(
      parseImportConformanceArguments([
        '--pack',
        'swf-ruffle-fixtures',
        '--score-file',
        '.artifacts/import-conformance/score.json',
        '--run-id',
        'run-1',
        '--run-url',
        'https://ci.invalid/run-1',
      ]),
    ).toEqual({
      mode: 'exhaustive',
      pack: 'swf-ruffle-fixtures',
      runId: 'run-1',
      runUrl: 'https://ci.invalid/run-1',
      scoreFile: '.artifacts/import-conformance/score.json',
    });
  });

  it('makes capability selection a subset that cannot accept score provenance', () => {
    expect(parseImportConformanceArguments(['--pack=swf-ruffle-fixtures', '--capability=swf.fill.solid'])).toEqual({
      capability: 'swf.fill.solid',
      mode: 'subset',
      pack: 'swf-ruffle-fixtures',
    });
    expect(() =>
      parseImportConformanceArguments([
        '--pack=swf-ruffle-fixtures',
        '--capability=swf.fill.solid',
        '--score-file=score.json',
      ]),
    ).toThrow(/unavailable for a capability subset/);
  });

  it('rejects unapproved selectors and missing exhaustive provenance', () => {
    expect(() => parseImportConformanceArguments(['--since=HEAD'])).toThrow(/Unknown option --since/);
    expect(() => parseImportConformanceArguments(['--pack=swf-ruffle-fixtures'])).toThrow(/--run-id is required/);
  });
});

describe('parseImportConformanceShardSelection', () => {
  it('uses a one-shard default and parses one-based matrix values', () => {
    expect(parseImportConformanceShardSelection(undefined)).toEqual({ index: 0, total: 1 });
    expect(parseImportConformanceShardSelection('2/5')).toEqual({ index: 1, total: 5 });
    expect(() => parseImportConformanceShardSelection('0/5')).toThrow(/1 <= index <= total/);
  });
});
