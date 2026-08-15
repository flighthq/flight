import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildOracleCandidateBundle, readPngDimensions, stageOracleCandidateImages } from './oracle-candidate';
import type { OracleCandidateInput } from './oracle-candidate';
import type { OracleRequest } from './oracle-records';

const PIXEL_HASH = 'c'.repeat(64);

describe('buildOracleCandidateBundle', () => {
  it('emits the identity structured, not slash-joined, because the consumer keys on the parts', () => {
    const capture = buildOracleCandidateBundle(input(root({ hash: PIXEL_HASH }))).captures[0];

    expect(capture?.identity).toEqual({ entry: 'shape', renderer: 'webgl', subject: 'functional' });
  });

  it('names the file at the path the archive actually uses', () => {
    const capture = buildOracleCandidateBundle(input(root({ hash: PIXEL_HASH }))).captures[0];

    expect(capture && 'file' in capture && capture.file).toBe('images/functional/shape/webgl.png');
  });

  it('takes provenance from THIS capture, not from a committed baseline', () => {
    // ★ A stale record is as false as a fabricated one. Reading the baseline was the previous design and
    // flight-oracles rejected a candidate over it: the baseline said frames 0 while the commission asked
    // for 1, so the record described conditions those bytes were not produced under.
    const capture = buildOracleCandidateBundle(input(root({ hash: PIXEL_HASH }))).captures[0];

    expect(capture && 'provenance' in capture && capture.provenance).toEqual({
      frames: 2,
      sourceHash: 'd'.repeat(64),
      targetKind: 'webgl',
      verifyPublished: true,
      warmupFrames: 1,
    });
  });

  it('reports a capture that recorded no provenance as missing, never as captured without it', () => {
    const directory = root({ hash: PIXEL_HASH, provenance: false });

    const capture = buildOracleCandidateBundle(input(directory)).captures[0];

    expect(capture?.status).toBe('missing');
    expect(capture && 'error' in capture && capture.error).toContain('no provenance');
  });

  it('prefixes a bare environment digest, since the schema requires the algorithm', () => {
    const bundle = buildOracleCandidateBundle(input(root({ hash: PIXEL_HASH })));

    expect(bundle.environmentId).toBe(`sha256-${'e'.repeat(64)}`);
  });

  it('does not prefix one that already carries it', () => {
    const bundle = buildOracleCandidateBundle({
      ...input(root({ hash: PIXEL_HASH })),
      environmentId: `sha256-${'f'.repeat(64)}`,
    });

    expect(bundle.environmentId).toBe(`sha256-${'f'.repeat(64)}`);
  });

  // §8: every requested cell is represented; a failure is an explicit row with a reason.
  it('represents an uncaptured cell as an explicit missing row, never as an absence', () => {
    const bundle = buildOracleCandidateBundle(input(mkdtempSync(join(tmpdir(), 'oracle-empty-'))));

    expect(bundle.captures).toHaveLength(1);
    expect(bundle.captures[0]?.status).toBe('missing');
  });

  it('reports a failed capture with its own error rather than bundling the stale image', () => {
    const capture = buildOracleCandidateBundle(
      input(root({ error: 'page never loaded', hash: PIXEL_HASH, state: 'error' })),
    ).captures[0];

    expect(capture && 'error' in capture && capture.error).toContain('page never loaded');
  });
});

describe('readPngDimensions', () => {
  it('reads width and height from IHDR', () => {
    expect(readPngDimensions(png())).toEqual({ height: 2, width: 3 });
  });

  it('returns null for bytes that are not a PNG', () => {
    expect(readPngDimensions(new Uint8Array(32))).toBeNull();
  });

  it('returns null for a truncated header rather than reading past the end', () => {
    expect(readPngDimensions(png().subarray(0, 20))).toBeNull();
  });
});

describe('stageOracleCandidateImages', () => {
  it('places every captured image at exactly the path its record names', () => {
    const directory = root({ hash: PIXEL_HASH });
    const bundle = buildOracleCandidateBundle(input(directory));
    const stage = mkdtempSync(join(tmpdir(), 'oracle-stage-'));

    expect(stageOracleCandidateImages(bundle, directory, stage)).toBe(1);
    for (const capture of bundle.captures) {
      if (capture.status !== 'captured') continue;
      expect(existsSync(join(stage, capture.file))).toBe(true);
    }
  });

  it('stages nothing for a missing cell rather than inventing a file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'oracle-empty-'));
    const bundle = buildOracleCandidateBundle(input(empty));

    expect(stageOracleCandidateImages(bundle, empty, mkdtempSync(join(tmpdir(), 'oracle-stage-')))).toBe(0);
  });
});

function input(directory: string): OracleCandidateInput {
  return {
    artifactsRoot: directory,
    comparisonPolicyId: 'uncalibrated',
    environmentId: 'e'.repeat(64),
    repositoryRoot: directory,
    request: {
      frames: 1,
      id: 'seed-1',
      reason: 'seed',
      schemaVersion: 1,
      subject: 'functional',
      targets: [{ entry: 'shape', renderers: ['webgl'] }],
    } as OracleRequest,
  };
}

function root(status: { hash: string | null; state?: string; error?: string; provenance?: boolean }): string {
  const directory = mkdtempSync(join(tmpdir(), 'oracle-candidate-'));
  const cell = join(directory, 'functional', 'shape', 'webgl');
  mkdirSync(cell, { recursive: true });
  writeFileSync(join(cell, 'screenshot.png'), png());
  const record: Record<string, unknown> = {
    error: status.error ?? null,
    hash: status.hash,
    state: status.state ?? 'ready',
  };
  if (status.provenance !== false) {
    record['provenance'] = {
      frames: 2,
      sourceHash: 'd'.repeat(64),
      targetKind: 'webgl',
      verifyPublished: true,
      warmupFrames: 1,
    };
  }
  writeFileSync(join(cell, 'status.json'), JSON.stringify(record));
  return directory;
}

/** A minimal 3×2 PNG header — signature, IHDR length, type, width, height. Format facts, not a fixture. */
function png(): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 3, false);
  view.setUint32(20, 2, false);
  return bytes;
}
