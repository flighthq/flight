import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { OracleRequest } from './oracle-records';
import { getOracleRequestCells, readOracleLock, readOracleRequest } from './oracle-records';

const COMMIT = 'a'.repeat(40);
const SHA = 'b'.repeat(64);

describe('getOracleRequestCells', () => {
  it('expands every target × renderer into subject-qualified cells', () => {
    const cells = getOracleRequestCells({
      frames: 1,
      id: 'r1',
      reason: 'test',
      schemaVersion: 1,
      subject: 'functional',
      targets: [
        { entry: 'shape-fill-solid', renderers: ['webgl', 'webgpu'] },
        { entry: 'text-strikethrough', renderers: ['dom'] },
      ],
    });

    // One definition of scope, used by both the pending allowance and the out-of-scope gate. If these
    // ever disagreed, a request could demote a cell the gate still considered out of scope.
    expect(cells).toEqual([
      'functional/shape-fill-solid/webgl',
      'functional/shape-fill-solid/webgpu',
      'functional/text-strikethrough/dom',
    ]);
  });
});

describe('readOracleLock', () => {
  it('accepts a well-formed lock', () => {
    const result = readOracleLock(writeJson({ ...lock() }));

    expect('lock' in result && result.lock.packs['functional-shapes']?.sha256).toBe(SHA);
  });

  it('reports unreadable and unparsable files rather than throwing', () => {
    const missing = readOracleLock(join(mkdtempSync(join(tmpdir(), 'oracle-')), 'absent.json'));
    const garbage = readOracleLock(writeRaw('{not json'));

    expect('problems' in missing && missing.problems[0]?.kind).toBe('not-json');
    expect('problems' in garbage && garbage.problems[0]?.kind).toBe('not-json');
  });

  it('rejects a commit or sha256 that is not the right shape', () => {
    // A truncated or uppercase hash is the shape a hand-edited lock takes, and it must not be accepted
    // and then fail later against a fetched artifact with a confusing message.
    const shortCommit = readOracleLock(writeJson({ ...lock(), oracleCommit: 'abc123' }));
    const upperSha = readOracleLock(writeJson({ ...lock(), manifestSha256: SHA.toUpperCase() }));

    expect('problems' in shortCommit && shortCommit.problems.map((p) => p.kind)).toContain('field-type');
    expect('problems' in upperSha && upperSha.problems.map((p) => p.kind)).toContain('field-type');
  });

  it('rejects an empty packs map, which would pin a release supplying nothing', () => {
    const result = readOracleLock(writeJson({ ...lock(), packs: {} }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('field-empty');
  });

  it('names the offending pack rather than reporting a bare type error', () => {
    const result = readOracleLock(writeJson({ ...lock(), packs: { 'functional-shapes': { file: 'x.tgz' } } }));

    expect('problems' in result && result.problems[0]?.detail).toContain('packs.functional-shapes.sha256');
  });

  it('rejects a schemaVersion it does not implement', () => {
    const result = readOracleLock(writeJson({ ...lock(), schemaVersion: 2 }));

    expect('problems' in result && result.problems[0]?.kind).toBe('schema-version');
  });
});

describe('readOracleRequest', () => {
  it('accepts a well-formed request', () => {
    const result = readOracleRequest(writeJson({ ...request() }));

    expect('request' in result && result.request.id).toBe('shape-fill-solid-webgl-2026-08-14');
  });

  it('rejects a request naming no targets, which would demote nothing and expire silently', () => {
    const result = readOracleRequest(writeJson({ ...request(), targets: [] }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('field-empty');
  });

  it('rejects the same cell named twice in one request', () => {
    const result = readOracleRequest(
      writeJson({
        ...request(),
        targets: [
          { entry: 'a', renderers: ['webgl'] },
          { entry: 'a', renderers: ['webgl'] },
        ],
      }),
    );

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('duplicate-target');
  });

  it('rejects a non-positive frame count', () => {
    const result = readOracleRequest(writeJson({ ...request(), frames: 0 }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('field-type');
  });

  it('accepts a request that carries no commit SHA, which is the documented shape', () => {
    // §5 is explicit that a request must NOT name the commit containing it — a self-reference whose
    // value cannot exist before the commit does. Asserted so a later "helpful" required field is caught.
    const result = readOracleRequest(writeJson({ ...request() }));

    expect('request' in result).toBe(true);
    expect(Object.keys(('request' in result ? result.request : {}) as object)).not.toContain('commit');
  });
});

function lock(): Record<string, unknown> {
  return {
    manifestSha256: SHA,
    oracleCommit: COMMIT,
    packs: { 'functional-shapes': { file: 'functional-shapes-v1.tgz', sha256: SHA } },
    releaseTag: 'v1',
    repository: 'flighthq/flight-oracles',
    schemaVersion: 1,
  };
}

function request(): OracleRequest {
  return {
    frames: 1,
    id: 'shape-fill-solid-webgl-2026-08-14',
    reason: 'add the first full-resolution reference for the solid-fill scene',
    schemaVersion: 1,
    subject: 'functional',
    targets: [{ entry: 'shape-fill-solid', renderers: ['webgl'] }],
  };
}

function writeJson(value: unknown): string {
  return writeRaw(JSON.stringify(value, null, 2));
}

function writeRaw(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'oracle-records-')), 'record.json');
  writeFileSync(path, text);
  return path;
}
