import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import type { ReferenceImageToleranceCatalog } from './reference-image-tolerance';
import { readPackManifest, verifyOracleCaptures, verifyOracleLockImages } from './reference-image-verify';

// ★ EACH CASE ASSERTS A DIFFERENT CAUSE PRODUCES A DIFFERENT NAME. The whole value of this layer is that
// a corrupt pack, an absent capture, an undecodable file and a genuine render change do not collapse into
// one verdict — a collapsed verdict sends the reader to the wrong repository.

describe('readPackManifest', () => {
  it('returns the images a well-formed manifest lists', () => {
    const path = write('pack-manifest.json', JSON.stringify({ images: [image()] }));

    expect('images' in readPackManifest(path) && readPackManifest(path)).toMatchObject({ images: [image()] });
  });

  it('names a manifest that is absent rather than treating it as empty', () => {
    expect(readPackManifest(join(mkdtempSync(join(tmpdir(), 'reference-image-')), 'nope.json'))).toMatchObject({
      problem: expect.stringContaining('no pack manifest'),
    });
  });

  it('names a manifest that does not parse', () => {
    expect(readPackManifest(write('pack-manifest.json', '{ not json'))).toMatchObject({
      problem: expect.stringContaining('did not parse'),
    });
  });

  // ★ AN EMPTY PACK IS A PROBLEM, NOT A CLEAN RUN. Zero images verifies zero cells and would otherwise
  // report a pass — the exact shape of a silent gate.
  it('refuses a manifest that lists no images', () => {
    expect(readPackManifest(write('pack-manifest.json', JSON.stringify({ images: [] })))).toMatchObject({
      problem: expect.stringContaining('no images'),
    });
  });

  it('refuses an entry missing the hashes the comparison depends on', () => {
    const path = write('pack-manifest.json', JSON.stringify({ images: [{ path: 'images/a/b/webgl.png' }] }));

    expect(readPackManifest(path)).toMatchObject({ problem: expect.stringContaining('artifactSha256') });
  });

  it('refuses an entry missing the dimensions', () => {
    const { width: _w, height: _h, ...noSize } = image();
    const path = write('pack-manifest.json', JSON.stringify({ images: [noSize] }));

    expect(readPackManifest(path)).toMatchObject({ problem: expect.stringContaining('width/height') });
  });
});

describe('verifyOracleCaptures', () => {
  it('compares a fresh capture that matches the blessed reference', () => {
    const pixels = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const { packRoot, artifactsRoot, images } = fixture(pixels, pixels);
    const result = verifyOracleCaptures(packRoot, images, artifactsRoot, exactCatalog());

    expect(result.problems).toEqual([]);
    expect(result.cells).toEqual([
      {
        comparison: { dimensionMismatch: false, fraction: 0, maxChannelDelta: 0 },
        comparisonPolicy: {
          channelTolerance: 0,
          comparisonPolicyId: 'test-policy',
          gateOnMaxChannelDelta: true,
          maxChannelDelta: 0,
          maxFraction: 0,
          overridden: false,
          reason: null,
          scene: 'functional/shape-fill-solid',
        },
        identity: 'functional/shape-fill-solid/webgl',
        pinned: true,
        required: true,
      },
    ]);
  });

  it('reports a fresh capture whose pixels moved as a comparison, not a problem', () => {
    const blessed = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const drifted = new Uint8Array([11, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const { packRoot, artifactsRoot, images } = fixture(blessed, drifted);
    const result = verifyOracleCaptures(packRoot, images, artifactsRoot, exactCatalog());

    // A render change is a legitimate answer from a sound pipeline: nothing is wrong with the machinery.
    expect(result.problems).toEqual([]);
    expect(result.cells[0]?.comparison?.fraction).toBe(1);
  });

  it('decodes both images and measures a hash-different capture under a scene override', () => {
    const blessed = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const drifted = new Uint8Array([13, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const { packRoot, artifactsRoot, images } = fixture(blessed, drifted);
    const result = verifyOracleCaptures(packRoot, images, artifactsRoot, fuzzyCatalog());

    expect(result.problems).toEqual([]);
    expect(result.cells[0]).toMatchObject({
      comparison: { dimensionMismatch: false, fraction: 0.25, maxChannelDelta: 3 },
      comparisonPolicy: { channelTolerance: 2, maxFraction: 0.25, overridden: true },
    });
  });

  // ★ THE CENTRAL FIRING TEST. Corrupt pack bytes must never reach a pixel comparison. If they did, the
  // cell would report `regressed` and send someone to look at a shader over a broken download.
  it('names a corrupt pack image and does not compare it', () => {
    const pixels = new Uint8Array(16);
    const { packRoot, artifactsRoot, images } = fixture(pixels, pixels);
    const tampered = images.map((i) => ({ ...i, artifactSha256: 'a'.repeat(64) }));
    const result = verifyOracleCaptures(packRoot, tampered, artifactsRoot, exactCatalog());

    expect(result.problems.map((p) => p.kind)).toEqual(['pack-image-corrupt']);
    expect(result.cells[0]).toMatchObject({ comparison: null, pinned: false });
  });

  it('names a reference the manifest promised and the pack does not carry', () => {
    const pixels = new Uint8Array(16);
    const { packRoot, artifactsRoot, images } = fixture(pixels, pixels);
    const absent = [{ ...images[0]!, path: 'images/functional/absent/webgl.png' }];
    const result = verifyOracleCaptures(packRoot, absent, artifactsRoot, exactCatalog());

    expect(result.problems.map((p) => p.kind)).toEqual(['pack-image-missing']);
    expect(result.cells[0]).toMatchObject({ comparison: null, pinned: false, required: true });
  });

  // A cell nobody captured is `pinned: true, comparison: null` — which joinOracleState reads as an
  // uncompared requirement. Marking it unpinned would hide that a blessed reference exists for it.
  it('names a missing fresh capture without claiming the reference is absent', () => {
    const pixels = new Uint8Array(16);
    const { packRoot, images } = fixture(pixels, pixels);
    const result = verifyOracleCaptures(
      packRoot,
      images,
      mkdtempSync(join(tmpdir(), 'reference-image-empty-')),
      exactCatalog(),
    );

    expect(result.problems.map((p) => p.kind)).toEqual(['capture-missing']);
    expect(result.cells[0]).toMatchObject({ comparison: null, pinned: true, required: true });
  });

  it('names a fresh capture it could not decode rather than hashing whatever it read', () => {
    const pixels = new Uint8Array(16);
    const { packRoot, artifactsRoot, images } = fixture(pixels, pixels);
    writeFileSync(join(artifactsRoot, 'functional/shape-fill-solid/webgl/screenshot.png'), Buffer.alloc(64));
    const result = verifyOracleCaptures(packRoot, images, artifactsRoot, exactCatalog());

    expect(result.problems.map((p) => p.kind)).toEqual(['capture-undecodable']);
    expect(result.problems[0]?.detail).toContain('not-a-png');
  });

  // ★ A RESIZED SCENE IS A VERDICT, NOT A CRASH (§9). One entry changing shape must not abort the corpus
  // and take every other cell's answer with it.
  it('reports a dimension change as an incomparable cell and keeps going', () => {
    const blessed = new Uint8Array(16);
    const { packRoot, artifactsRoot, images } = fixture(blessed, blessed);
    const result = verifyOracleCaptures(
      packRoot,
      [{ ...images[0]!, height: 4, width: 4 }],
      artifactsRoot,
      exactCatalog(),
    );

    expect(result.problems.map((p) => p.kind)).toEqual(['dimensions']);
    expect(result.cells[0]?.comparison?.dimensionMismatch).toBe(true);
    expect(result.problems[0]?.detail).toContain('2x2');
  });
});

describe('verifyOracleLockImages', () => {
  it('accepts the same identity and pixel hash at both ends of the verified pack link', () => {
    expect(
      verifyOracleLockImages({ 'functional/shape-fill-solid/webgl': { pixelSha256: 'b'.repeat(64) } }, [image()]),
    ).toEqual([]);
  });

  it('reports a changed pixel identity and omissions in both directions', () => {
    const problems = verifyOracleLockImages(
      {
        'functional/absent/webgl': { pixelSha256: 'b'.repeat(64) },
        'functional/shape-fill-solid/webgl': { pixelSha256: 'c'.repeat(64) },
      },
      [image(), { ...image(), path: 'images/functional/unlisted/webgl.png' }],
    );

    expect(problems.map((problem) => problem.kind)).toEqual([
      'lock-image-missing',
      'lock-image-mismatch',
      'lock-image-unlisted',
    ]);
  });
});

/** Builds an extracted pack and a capture tree for one cell, from the two sets of pixels given. */
function fixture(blessedPixels: Readonly<Uint8Array>, capturedPixels: Readonly<Uint8Array>) {
  const packRoot = mkdtempSync(join(tmpdir(), 'reference-image-pack-'));
  const artifactsRoot = mkdtempSync(join(tmpdir(), 'reference-image-art-'));
  const blessed = png(2, 2, blessedPixels);
  const captured = png(2, 2, capturedPixels);

  mkdirSync(join(packRoot, 'images/functional/shape-fill-solid'), { recursive: true });
  writeFileSync(join(packRoot, 'images/functional/shape-fill-solid/webgl.png'), blessed);
  mkdirSync(join(artifactsRoot, 'functional/shape-fill-solid/webgl'), { recursive: true });
  writeFileSync(join(artifactsRoot, 'functional/shape-fill-solid/webgl/screenshot.png'), captured);

  return {
    artifactsRoot,
    images: [
      {
        artifactSha256: sha(blessed),
        height: 2,
        path: 'images/functional/shape-fill-solid/webgl.png',
        pixelSha256: sha(blessedPixels),
        width: 2,
      },
    ],
    packRoot,
  };
}

function image() {
  return {
    artifactSha256: 'a'.repeat(64),
    height: 600,
    path: 'images/functional/shape-fill-solid/webgl.png',
    pixelSha256: 'b'.repeat(64),
    width: 800,
  };
}

function exactCatalog(): ReferenceImageToleranceCatalog {
  return { comparisonPolicyId: 'test-policy', scenes: {}, schemaVersion: 1 };
}

function fuzzyCatalog(): ReferenceImageToleranceCatalog {
  return {
    comparisonPolicyId: 'test-policy',
    schemaVersion: 1,
    scenes: {
      'functional/shape-fill-solid': {
        channelTolerance: 2,
        gateOnMaxChannelDelta: true,
        maxChannelDelta: 4,
        maxFraction: 0.25,
        reason: 'test',
      },
    },
  };
}

function write(name: string, content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'reference-image-')), name);
  writeFileSync(path, content);
  return path;
}

function sha(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** An unfiltered 8-bit RGBA PNG. Format facts only; the same shape `reference-image-png.test.ts` builds. */
function png(width: number, height: number, pixels: Readonly<Uint8Array>): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = pixels[y * stride + x] ?? 0;
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const chunks = [
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let total = signature.length;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let at = signature.length;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function chunk(type: string, data: Readonly<Uint8Array>): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out;
}
