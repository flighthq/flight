import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildOracleCandidateBundle, hashOracleFile, readPngDimensions } from './oracle-candidate';
import type { OracleRequest } from './oracle-records';

const PIXEL_HASH = 'c'.repeat(64);

describe('buildOracleCandidateBundle', () => {
  it('copies the capture’s decoded-pixel hash rather than recomputing one', () => {
    const root = captureRoot({ hash: PIXEL_HASH });

    const bundle = buildOracleCandidateBundle(input(root));
    const image = bundle.images[0];

    // ★ The whole point: a second decoder with a second convention would put a DIFFERENT "pixel hash"
    // beside the one already stored for the same image, and nothing downstream could say which was right.
    expect(image?.state).toBe('captured');
    expect(image && 'pixelSha256' in image && image.pixelSha256).toBe(PIXEL_HASH);
  });

  it('computes artifactSha256 over the encoded file, distinct from the pixel hash', () => {
    const root = captureRoot({ hash: PIXEL_HASH });

    const image = buildOracleCandidateBundle(input(root)).images[0];

    expect(image && 'artifactSha256' in image && image.artifactSha256).toBe(
      createHash('sha256').update(pngBytes()).digest('hex'),
    );
    expect(image && 'artifactSha256' in image && image.artifactSha256).not.toBe(PIXEL_HASH);
  });

  it('reads the dimensions out of the PNG header', () => {
    const image = buildOracleCandidateBundle(input(captureRoot({ hash: PIXEL_HASH }))).images[0];

    expect(image && 'width' in image && [image.width, image.height]).toEqual([3, 2]);
  });

  // ── §8: every requested cell is represented; a failure is an explicit row ─────────────────────────

  it('represents an uncaptured cell as an explicit missing row, never as an absence', () => {
    const bundle = buildOracleCandidateBundle(input(mkdtempSync(join(tmpdir(), 'oracle-empty-'))));

    expect(bundle.images).toHaveLength(1);
    expect(bundle.images[0]?.state).toBe('missing');
    expect(bundle.images[0] && 'reason' in bundle.images[0] && bundle.images[0].reason).toContain('screenshot.png');
  });

  it('reports a failed capture with its own error rather than bundling the stale image', () => {
    const root = captureRoot({ error: 'page never loaded', hash: PIXEL_HASH, state: 'error' });

    const image = buildOracleCandidateBundle(input(root)).images[0];

    expect(image?.state).toBe('missing');
    expect(image && 'reason' in image && image.reason).toContain('page never loaded');
  });

  it('reports a blank frame as missing, because a blank capture records no hash', () => {
    // captureEntry refuses to hash a blank frame, so an absent hash means there is no render to bless.
    const root = captureRoot({ hash: null });

    expect(buildOracleCandidateBundle(input(root)).images[0]?.state).toBe('missing');
  });

  it('carries the request binding and environment as provenance', () => {
    const bundle = buildOracleCandidateBundle(input(captureRoot({ hash: PIXEL_HASH })));

    expect(bundle.requestId).toBe('seed-1');
    expect(bundle.requestSha256).toBe('a'.repeat(64));
    expect(bundle.flightCommit).toBe('b'.repeat(40));
    expect(bundle.environmentId).toBe('env-1');
  });

  it('covers every cell a multi-renderer request names', () => {
    const request: OracleRequest = {
      frames: 1,
      id: 'seed-1',
      reason: 'seed',
      schemaVersion: 1,
      subject: 'functional',
      targets: [{ entry: 'shape', renderers: ['webgl', 'webgpu'] }],
    };

    const bundle = buildOracleCandidateBundle({ ...input(captureRoot({ hash: PIXEL_HASH })), request });

    expect(bundle.images.map((image) => image.identity)).toEqual(['functional/shape/webgl', 'functional/shape/webgpu']);
  });
});

describe('hashOracleFile', () => {
  it('hashes the file bytes', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'oracle-hash-')), 'f.bin');
    writeFileSync(path, 'abc');

    expect(hashOracleFile(path)).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});

describe('readPngDimensions', () => {
  it('reads width and height from IHDR', () => {
    expect(readPngDimensions(pngBytes())).toEqual({ height: 2, width: 3 });
  });

  it('returns null for bytes that are not a PNG', () => {
    expect(readPngDimensions(new Uint8Array(32))).toBeNull();
  });

  it('returns null for a truncated header rather than reading past the end', () => {
    expect(readPngDimensions(pngBytes().subarray(0, 20))).toBeNull();
  });
});

function captureRoot(status: { hash: string | null; state?: string; error?: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'oracle-candidate-'));
  const directory = join(root, 'functional', 'shape', 'webgl');
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'screenshot.png'), pngBytes());
  writeFileSync(
    join(directory, 'status.json'),
    JSON.stringify({ error: status.error ?? null, hash: status.hash, state: status.state ?? 'ready' }),
  );
  return root;
}

function input(artifactsRoot: string) {
  return {
    artifactsRoot,
    environmentId: 'env-1',
    flightCommit: 'b'.repeat(40),
    request: {
      frames: 1,
      id: 'seed-1',
      reason: 'seed',
      schemaVersion: 1,
      subject: 'functional',
      targets: [{ entry: 'shape', renderers: ['webgl'] }],
    } as OracleRequest,
    requestSha256: 'a'.repeat(64),
  };
}

/** A minimal 3×2 PNG header — signature, IHDR length, type, width, height. Format facts, not a fixture. */
function pngBytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 3, false);
  view.setUint32(20, 2, false);
  return bytes;
}
