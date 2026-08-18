import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import {
  buildOracleCandidateBundle,
  readBoundOracleRequestTarget,
  readPngDimensions,
  stageOracleCandidateImages,
  verifyOracleRequestedPixels,
} from './reference-image-candidate';
import type { ReferenceImageCandidateInput } from './reference-image-candidate';
import { hashOraclePixelBytes } from './reference-image-png';
import type { ReferenceImageRequest } from './reference-image-records';

const PIXEL_HASH = 'c'.repeat(64);
const REQUEST_PIXEL_HASH = hashOraclePixelBytes(new Uint8Array(24));

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
    // flight-reference-images rejected a candidate over it: the baseline said frames 0 while the commission asked
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
    const bundle = buildOracleCandidateBundle(input(mkdtempSync(join(tmpdir(), 'reference-image-empty-'))));

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
    const stage = mkdtempSync(join(tmpdir(), 'reference-image-stage-'));

    expect(stageOracleCandidateImages(bundle, directory, stage)).toBe(1);
    for (const capture of bundle.captures) {
      if (capture.status !== 'captured') continue;
      expect(existsSync(join(stage, capture.file))).toBe(true);
    }
  });

  it('stages nothing for a missing cell rather than inventing a file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'reference-image-empty-'));
    const bundle = buildOracleCandidateBundle(input(empty));

    expect(stageOracleCandidateImages(bundle, empty, mkdtempSync(join(tmpdir(), 'reference-image-stage-')))).toBe(0);
  });
});

describe('verifyOracleRequestedPixels', () => {
  it('accepts the later capture only when its decoded pixels are the image the request selected', () => {
    const request = input(root({ hash: PIXEL_HASH })).request;
    const artifacts = root({ hash: PIXEL_HASH });

    expect(verifyOracleRequestedPixels(request, artifacts)).toEqual([]);
  });

  it('refuses a differing decoded image instead of blessing whatever a later capture produced', () => {
    const artifacts = root({ hash: PIXEL_HASH });
    const request = input(artifacts).request;
    request.targets[0]!.pixelSha256 = 'f'.repeat(64);

    expect(verifyOracleRequestedPixels(request, artifacts).map((problem) => problem.kind)).toEqual([
      'request-image-mismatch',
    ]);
  });

  it('refuses when no capture exists to prove the requested pixel identity', () => {
    const request = input(root({ hash: PIXEL_HASH })).request;

    expect(verifyOracleRequestedPixels(request, mkdtempSync(join(tmpdir(), 'reference-image-empty-')))[0]?.kind).toBe(
      'request-image-missing',
    );
  });
});

describe('readBoundOracleRequestTarget', () => {
  it('records the selected PNG, capture run, and served build in the v3 target shape', () => {
    const capture = { environmentId: 'environment', hostInstanceId: 'host' };

    expect(readBoundOracleRequestTarget(root({ hash: PIXEL_HASH }), 'functional/shape/webgl', capture)).toEqual({
      build: { commit: 'a'.repeat(40), dirty: ['packages/effects/src/drop-shadow.ts'], dirtyOmitted: 0 },
      capture,
      entry: 'shape',
      pixelSha256: REQUEST_PIXEL_HASH,
      renderer: 'webgl',
    });
  });

  it('refuses to manufacture a target when the selected run has no image', () => {
    const selected = mkdtempSync(join(tmpdir(), 'reference-image-empty-'));

    expect(
      readBoundOracleRequestTarget(selected, 'functional/shape/webgl', {
        environmentId: 'environment',
        hostInstanceId: 'host',
      }),
    ).toHaveProperty('problem');
  });
});

function input(directory: string): ReferenceImageCandidateInput {
  return {
    artifactsRoot: directory,
    comparisonPolicyId: 'uncalibrated',
    environmentId: 'e'.repeat(64),
    repositoryRoot: directory,
    request: {
      frames: 1,
      id: 'seed-1',
      reason: 'seed',
      schemaVersion: 2,
      subject: 'functional',
      targets: [
        {
          capture: { environmentId: 'environment', hostInstanceId: 'host' },
          entry: 'shape',
          pixelSha256: REQUEST_PIXEL_HASH,
          renderer: 'webgl',
        },
      ],
    } as ReferenceImageRequest,
  };
}

function root(status: { hash: string | null; state?: string; error?: string; provenance?: boolean }): string {
  const directory = mkdtempSync(join(tmpdir(), 'reference-image-candidate-'));
  const cell = join(directory, 'functional', 'shape', 'webgl');
  mkdirSync(cell, { recursive: true });
  writeFileSync(join(cell, 'screenshot.png'), png());
  const record: Record<string, unknown> = {
    build: { commit: 'a'.repeat(40), dirty: ['packages/effects/src/drop-shadow.ts'], dirtyOmitted: 0 },
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

/** A minimal decodable 3×2 RGBA PNG. CRC bytes are present but not evaluated by the narrow decoder. */
function png(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 3, false);
  view.setUint32(4, 2, false);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(26);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function chunk(type: string, data: Readonly<Uint8Array>): Uint8Array {
  const bytes = new Uint8Array(12 + data.length);
  new DataView(bytes.buffer).setUint32(0, data.length, false);
  for (const [index, character] of [...type].entries()) bytes[4 + index] = character.charCodeAt(0);
  bytes.set(data, 8);
  return bytes;
}
