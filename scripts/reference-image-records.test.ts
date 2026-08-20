import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ReferenceImageRequest } from './reference-image-records';
import {
  getOracleLockImages,
  getOracleRequestCells,
  readReferenceImageLock,
  readReferenceImageLockPins,
  readOracleRequest,
  readReferenceImageHolds,
} from './reference-image-records';

const COMMIT = 'a'.repeat(40);
const SHA = 'b'.repeat(64);

describe('getOracleRequestCells', () => {
  it('expands every target × renderer into subject-qualified cells', () => {
    const cells = getOracleRequestCells({
      frames: 1,
      id: 'r1',
      reason: 'test',
      schemaVersion: 2,
      subject: 'functional',
      targets: [
        target('shape-fill-solid', 'webgl'),
        target('shape-fill-solid', 'webgpu'),
        target('text-strikethrough', 'dom'),
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

describe('readReferenceImageLock', () => {
  it('accepts a well-formed lock', () => {
    const result = readReferenceImageLock(writeJson({ ...lock() }));

    expect('lock' in result && result.lock.packs['functional-shapes']?.sha256).toBe(SHA);
    expect('lock' in result && getOracleLockImages(result.lock).get('functional/shape-fill-solid/webgl')).toEqual({
      pixelSha256: SHA,
    });
  });

  it('reports unreadable and unparsable files rather than throwing', () => {
    const missing = readReferenceImageLock(join(mkdtempSync(join(tmpdir(), 'reference-image-')), 'absent.json'));
    const garbage = readReferenceImageLock(writeRaw('{not json'));

    expect('problems' in missing && missing.problems[0]?.kind).toBe('not-json');
    expect('problems' in garbage && garbage.problems[0]?.kind).toBe('not-json');
  });

  it('rejects a commit or sha256 that is not the right shape', () => {
    // A truncated or uppercase hash is the shape a hand-edited lock takes, and it must not be accepted
    // and then fail later against a fetched artifact with a confusing message.
    const shortCommit = readReferenceImageLock(writeJson({ ...lock(), oracleCommit: 'abc123' }));
    const upperSha = readReferenceImageLock(writeJson({ ...lock(), manifestSha256: SHA.toUpperCase() }));

    expect('problems' in shortCommit && shortCommit.problems.map((p) => p.kind)).toContain('field-type');
    expect('problems' in upperSha && upperSha.problems.map((p) => p.kind)).toContain('field-type');
  });

  it('rejects an empty packs map, which would pin a release supplying nothing', () => {
    const result = readReferenceImageLock(writeJson({ ...lock(), packs: {} }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('field-empty');
  });

  it('names the offending pack rather than reporting a bare type error', () => {
    const result = readReferenceImageLock(writeJson({ ...lock(), packs: { 'functional-shapes': { file: 'x.tgz' } } }));

    expect('problems' in result && result.problems[0]?.detail).toContain('packs.functional-shapes.sha256');
  });

  it('rejects a pack with no readable per-image identity set', () => {
    const missing = readReferenceImageLock(
      writeJson({ ...lock(), packs: { 'functional-shapes': { file: 'x.tgz', sha256: SHA } } }),
    );
    const empty = readReferenceImageLock(
      writeJson({ ...lock(), packs: { 'functional-shapes': { file: 'x.tgz', images: {}, sha256: SHA } } }),
    );

    expect('problems' in missing && missing.problems[0]?.detail).toContain('packs.functional-shapes.images');
    expect('problems' in empty && empty.problems.map((p) => p.kind)).toContain('field-empty');
  });

  it('rejects a malformed pixel identity and one image named by two packs', () => {
    const malformed = readReferenceImageLock(
      writeJson({
        ...lock(),
        packs: {
          'functional-shapes': {
            file: 'x.tgz',
            images: { 'functional/shape-fill-solid/webgl': { pixelSha256: 'short' } },
            sha256: SHA,
          },
        },
      }),
    );
    const duplicate = readReferenceImageLock(
      writeJson({
        ...lock(),
        packs: {
          ...lock().packs,
          duplicate: {
            file: 'duplicate.tgz',
            images: { 'functional/shape-fill-solid/webgl': { pixelSha256: SHA } },
            sha256: SHA,
          },
        },
      }),
    );

    expect('problems' in malformed && malformed.problems.map((p) => p.kind)).toContain('field-type');
    expect('problems' in duplicate && duplicate.problems.map((p) => p.kind)).toContain('duplicate-image');
  });

  it('rejects a schemaVersion it does not implement', () => {
    const result = readReferenceImageLock(writeJson({ ...lock(), schemaVersion: 1 }));

    expect('problems' in result && result.problems[0]?.kind).toBe('schema-version');
  });
});

describe('readReferenceImageLockPins', () => {
  it('returns the locked identities', () => {
    const result = readReferenceImageLockPins(writeJson({ ...lock() }));

    expect('pinned' in result && [...result.pinned]).toEqual(['functional/shape-fill-solid/webgl']);
  });

  // ★ ABSENT AND UNREADABLE ARE DIFFERENT ANSWERS AND ONLY ONE OF THEM IS EMPTY. Before the first
  // release there is no lock, and that genuinely means nothing is pinned. A lock that exists and does
  // not parse means what is blessed is UNKNOWN — and empty fails toward "commission everything", which
  // would re-bless cells that are already gating. These two cases are asserted together because the
  // defect is returning the same value for both.
  it('reports no pins for an absent lock, because nothing is blessed before the first release', () => {
    const result = readReferenceImageLockPins(
      join(mkdtempSync(join(tmpdir(), 'reference-image-pins-')), 'absent.json'),
    );

    expect('pinned' in result && result.pinned.size).toBe(0);
  });

  it('refuses an unreadable lock rather than reporting nothing pinned', () => {
    const result = readReferenceImageLockPins(writeRaw('{not json'));

    expect('problems' in result).toBe(true);
    expect('pinned' in result).toBe(false);
  });

  it('refuses a lock whose schema does not validate, rather than salvaging what parsed', () => {
    const broken = lock() as Record<string, unknown>;
    delete broken['manifestSha256'];

    const result = readReferenceImageLockPins(writeJson(broken));

    expect('problems' in result).toBe(true);
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
        targets: [target('a', 'webgl'), target('a', 'webgl')],
      }),
    );

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('duplicate-target');
  });

  it('rejects a non-positive frame count', () => {
    const result = readOracleRequest(writeJson({ ...request(), frames: 0 }));

    expect('problems' in result && result.problems.map((p) => p.kind)).toContain('field-type');
  });

  it('requires every v3 target to bind pixels, capture identity, and the reviewed build', () => {
    const noPixel = readOracleRequest(writeJson({ ...request(), targets: [{ ...target(), pixelSha256: undefined }] }));
    const noHost = readOracleRequest(
      writeJson({ ...request(), targets: [{ ...target(), capture: { environmentId: 'environment' } }] }),
    );
    const noBuild = readOracleRequest(writeJson({ ...request(), targets: [{ ...target(), build: undefined }] }));

    expect('problems' in noPixel && noPixel.problems[0]?.detail).toContain('pixelSha256');
    expect('problems' in noHost && noHost.problems[0]?.detail).toContain('hostInstanceId');
    expect('problems' in noBuild && noBuild.problems[0]?.detail).toContain('build');
  });

  it('rejects request schemas outside the supported v2/v3 transition', () => {
    const result = readOracleRequest(
      writeJson({ ...request(), schemaVersion: 1, targets: [{ entry: 'shape-fill-solid', renderers: ['webgl'] }] }),
    );
    const newer = readOracleRequest(writeJson({ ...request(), schemaVersion: 4 }));

    expect('problems' in result && result.problems.map((problem) => problem.kind)).toContain('schema-version');
    expect('problems' in newer && newer.problems.map((problem) => problem.kind)).toContain('schema-version');
  });

  it('keeps legacy v2 requests readable while new v3 writers bind each target to its build', () => {
    const legacy = readOracleRequest(
      writeJson({ ...request(), schemaVersion: 2, targets: [{ ...target(), build: undefined }] }),
    );
    const current = readOracleRequest(writeJson({ ...request() }));

    expect('request' in legacy).toBe(true);
    expect('request' in current && current.request.targets[0]?.build?.commit).toBe(COMMIT);
  });
});

function lock() {
  return {
    manifestSha256: SHA,
    oracleCommit: COMMIT,
    packs: {
      'functional-shapes': {
        file: 'functional-shapes-v1.tgz',
        images: { 'functional/shape-fill-solid/webgl': { pixelSha256: SHA } },
        sha256: SHA,
      },
    },
    releaseTag: 'v1',
    repository: 'flighthq/flight-reference-images',
    schemaVersion: 2,
  };
}

function request(): ReferenceImageRequest {
  return {
    frames: 1,
    id: 'shape-fill-solid-webgl-2026-08-14',
    reason: 'add the first full-resolution reference for the solid-fill scene',
    schemaVersion: 3,
    subject: 'functional',
    targets: [target('shape-fill-solid', 'webgl')],
  };
}

function target(entry = 'shape-fill-solid', renderer = 'webgl') {
  return {
    build: { commit: COMMIT, dirty: ['packages/effects/src/drop-shadow.ts'], dirtyOmitted: 0 },
    capture: { environmentId: 'environment', hostInstanceId: 'host' },
    entry,
    pixelSha256: SHA,
    renderer,
  };
}

function writeJson(value: unknown): string {
  return writeRaw(JSON.stringify(value, null, 2));
}

function writeRaw(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'reference-image-records-')), 'record.json');
  writeFileSync(path, text);
  return path;
}

describe('readReferenceImageHolds', () => {
  it('reads the ledger as identity to reason', () => {
    const root = mkdtempSync(join(tmpdir(), 'reference-image-holds-'));
    writeFileSync(
      join(root, 'reference-image-held.json'),
      JSON.stringify({ held: { 'functional/a/webgl': 'awaiting the fold' } }),
    );

    expect([...readReferenceImageHolds(root)]).toEqual([['functional/a/webgl', 'awaiting the fold']]);
  });

  // ★ THE ABSENT LEDGER IS THE ONE EMPTY THAT IS REAL, and it is worth pinning because the opposite
  // reading is the dangerous one everywhere else in this family: an unreadable LOCK must never mean
  // "nothing is pinned", because that would re-bless the corpus. A missing HOLD list is different — a
  // repository with no disputes has no hold file — and returning empty there is the correct answer
  // rather than a failure mode.
  it('treats a missing ledger as nothing held', () => {
    expect(readReferenceImageHolds(mkdtempSync(join(tmpdir(), 'reference-image-holds-')))).toEqual(new Map());
  });

  it('treats a ledger with no held key as nothing held', () => {
    const root = mkdtempSync(join(tmpdir(), 'reference-image-holds-'));
    writeFileSync(join(root, 'reference-image-held.json'), JSON.stringify({ schemaVersion: 2, history: [] }));

    expect(readReferenceImageHolds(root)).toEqual(new Map());
  });
});
