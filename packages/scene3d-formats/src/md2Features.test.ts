import { collectMd2Features } from './md2Features.ts';
import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from './md2Schema.ts';

describe('collectMd2Features', () => {
  it('returns null for a buffer smaller than the header', () => {
    expect(collectMd2Features(new Uint8Array(10))).toBeNull();
  });

  it('returns null for wrong magic', () => {
    const header = buildMd2Header({ magic: 0x12345678 });
    expect(collectMd2Features(header)).toBeNull();
  });

  it('returns null for wrong version', () => {
    const header = buildMd2Header({ version: 99 });
    expect(collectMd2Features(header)).toBeNull();
  });

  it('returns null when a header count is negative', () => {
    const header = buildMd2Header({ numSkins: -1 });
    expect(collectMd2Features(header)).toBeNull();
  });

  it('returns an empty set for a valid header with all zero counts', () => {
    const header = buildMd2Header({});
    const features = collectMd2Features(header)!;
    expect(features).not.toBeNull();
    expect([...features]).toEqual([]);
  });

  it('reports Mesh when triangles and frames are present', () => {
    const header = buildMd2Header({ numFrames: 1, numTriangles: 10 });
    const features = collectMd2Features(header)!;
    expect(features.has('Mesh')).toBe(true);
    expect(features.has('Animation')).toBe(false);
  });

  it('does not report Mesh when triangles are present but frames are zero', () => {
    const header = buildMd2Header({ numFrames: 0, numTriangles: 10 });
    const features = collectMd2Features(header)!;
    expect(features.has('Mesh')).toBe(false);
  });

  it('does not report Mesh when frames are present but triangles are zero', () => {
    const header = buildMd2Header({ numFrames: 5, numTriangles: 0 });
    const features = collectMd2Features(header)!;
    expect(features.has('Mesh')).toBe(false);
  });

  it('reports Material when skins are present', () => {
    const header = buildMd2Header({ numSkins: 2 });
    const features = collectMd2Features(header)!;
    expect(features.has('Material')).toBe(true);
  });

  it('does not report Material when skins are zero', () => {
    const header = buildMd2Header({});
    const features = collectMd2Features(header)!;
    expect(features.has('Material')).toBe(false);
  });

  it('reports Animation when frames > 1', () => {
    const header = buildMd2Header({ numFrames: 5 });
    const features = collectMd2Features(header)!;
    expect(features.has('Animation')).toBe(true);
  });

  it('does not report Animation when frames equals 1', () => {
    const header = buildMd2Header({ numFrames: 1 });
    const features = collectMd2Features(header)!;
    expect(features.has('Animation')).toBe(false);
  });

  it('reports all features for a full model', () => {
    const header = buildMd2Header({ numFrames: 10, numSkins: 1, numTriangles: 50 });
    const features = collectMd2Features(header)!;
    expect([...features].sort()).toEqual(['Animation', 'Material', 'Mesh']);
  });

  it('handles a minimal mesh-only model (1 frame, 1 triangle, no skins)', () => {
    const header = buildMd2Header({ numFrames: 1, numTriangles: 1 });
    const features = collectMd2Features(header)!;
    expect([...features]).toEqual(['Mesh']);
  });
});

function buildMd2Header(overrides: {
  magic?: number;
  numFrames?: number;
  numSkins?: number;
  numTriangles?: number;
  version?: number;
}): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, overrides.magic ?? MD2_MAGIC, true);
  view.setInt32(4, overrides.version ?? MD2_VERSION, true);
  view.setInt32(20, overrides.numSkins ?? 0, true);
  view.setInt32(32, overrides.numTriangles ?? 0, true);
  view.setInt32(40, overrides.numFrames ?? 0, true);
  return new Uint8Array(buf);
}
