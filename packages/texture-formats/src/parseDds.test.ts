import { describe, expect, it } from 'vitest';

import { parseDds } from './parseDds';

function fourCC(text: string): number {
  return (
    (text.charCodeAt(0) | (text.charCodeAt(1) << 8) | (text.charCodeAt(2) << 16) | (text.charCodeAt(3) << 24)) >>> 0
  );
}

interface Dx10Options {
  dxgiFormat: number;
  miscFlag?: number;
  arraySize?: number;
}

interface DdsOptions {
  width: number;
  height: number;
  mipMapCount?: number;
  pfFlags: number;
  fourCC?: number;
  rgbBitCount?: number;
  masks?: readonly [number, number, number, number];
  caps2?: number;
  dx10?: Dx10Options;
  dataBytes?: number;
}

function buildDds(opts: DdsOptions): Uint8Array {
  const {
    width,
    height,
    mipMapCount = 1,
    pfFlags,
    fourCC: fourCCValue = 0,
    rgbBitCount = 0,
    masks = [0, 0, 0, 0],
    caps2 = 0,
    dx10,
    dataBytes = 256,
  } = opts;
  const headerEnd = 128 + (dx10 ? 20 : 0);
  const bytes = new Uint8Array(headerEnd + dataBytes);
  const dv = new DataView(bytes.buffer);
  bytes.set([0x44, 0x44, 0x53, 0x20], 0);
  dv.setUint32(4, 124, true);
  dv.setUint32(12, height, true);
  dv.setUint32(16, width, true);
  dv.setUint32(28, mipMapCount, true);
  dv.setUint32(76, 32, true);
  dv.setUint32(80, pfFlags, true);
  dv.setUint32(84, fourCCValue, true);
  dv.setUint32(88, rgbBitCount, true);
  dv.setUint32(92, masks[0], true);
  dv.setUint32(96, masks[1], true);
  dv.setUint32(100, masks[2], true);
  dv.setUint32(104, masks[3], true);
  dv.setUint32(112, caps2, true);
  if (dx10) {
    dv.setUint32(128, dx10.dxgiFormat, true);
    dv.setUint32(132, 3, true); // resourceDimension = TEXTURE2D
    dv.setUint32(136, dx10.miscFlag ?? 0, true);
    dv.setUint32(140, dx10.arraySize ?? 1, true);
  }
  return bytes;
}

describe('parseDds', () => {
  it('parses a single-mip BC1 (DXT1) texture', () => {
    const container = parseDds(buildDds({ fourCC: fourCC('DXT1'), height: 4, pfFlags: 0x4, width: 4 }));
    expect(container).not.toBeNull();
    expect(container!.format).toBe('bc1');
    expect(container!.width).toBe(4);
    expect(container!.height).toBe(4);
    expect(container!.mipLevels).toBe(1);
    expect(container!.faces).toBe(1);
    expect(container!.layers).toBe(1);
    expect(container!.supercompression).toBe('None');
    expect(container!.levels).toEqual([{ byteLength: 8, byteOffset: 128, height: 4, width: 4 }]);
  });

  it('maps uncompressed RGBA channel masks to bgra8unorm and rgba8unorm', () => {
    const bgra = parseDds(
      buildDds({
        height: 2,
        masks: [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000],
        pfFlags: 0x40,
        rgbBitCount: 32,
        width: 2,
      }),
    );
    expect(bgra!.format).toBe('bgra8unorm');
    expect(bgra!.levels).toEqual([{ byteLength: 16, byteOffset: 128, height: 2, width: 2 }]);
    const rgba = parseDds(
      buildDds({
        height: 2,
        masks: [0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000],
        pfFlags: 0x40,
        rgbBitCount: 32,
        width: 2,
      }),
    );
    expect(rgba!.format).toBe('rgba8unorm');
  });

  it('reports six faces for a cubemap and a full mip chain per face', () => {
    const container = parseDds(buildDdsCube());
    expect(container).not.toBeNull();
    expect(container!.faces).toBe(6);
    expect(container!.levels).toHaveLength(6);
    expect(container!.levels.map((l) => l.byteLength)).toEqual([16, 16, 16, 16, 16, 16]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([128, 144, 160, 176, 192, 208]);
  });

  it('computes descending byte ranges for a multi-mip BC1 texture', () => {
    const container = parseDds(buildDds({ fourCC: fourCC('DXT1'), height: 8, mipMapCount: 4, pfFlags: 0x4, width: 8 }));
    expect(container).not.toBeNull();
    expect(container!.mipLevels).toBe(4);
    expect(container!.levels.map((l) => l.width)).toEqual([8, 4, 2, 1]);
    expect(container!.levels.map((l) => l.byteLength)).toEqual([32, 8, 8, 8]);
    expect(container!.levels.map((l) => l.byteOffset)).toEqual([128, 160, 168, 176]);
  });

  it('reads a DX10 extension header and its DXGI format', () => {
    const container = parseDds(
      buildDds({ dx10: { dxgiFormat: 98 }, fourCC: fourCC('DX10'), height: 4, pfFlags: 0x4, width: 4 }),
    );
    expect(container).not.toBeNull();
    expect(container!.format).toBe('bc7');
    expect(container!.levels[0].byteOffset).toBe(148); // data follows the 20-byte DX10 header
  });

  it('lays out every DX10 array layer as an independent subresource chain', () => {
    const container = parseDds(
      buildDds({
        dx10: { arraySize: 3, dxgiFormat: 98 },
        fourCC: fourCC('DX10'),
        height: 4,
        pfFlags: 0x4,
        width: 4,
      }),
    );
    expect(container).not.toBeNull();
    expect(container!.layers).toBe(3);
    expect(container!.levels).toEqual([
      { byteLength: 16, byteOffset: 148, height: 4, width: 4 },
      { byteLength: 16, byteOffset: 164, height: 4, width: 4 },
      { byteLength: 16, byteOffset: 180, height: 4, width: 4 },
    ]);
  });

  it('returns null for a non-DDS, truncated, unknown-format, or volume texture', () => {
    expect(parseDds(new Uint8Array([0xab, 0x4b, 0x54, 0x58]))).toBeNull();
    expect(parseDds(new Uint8Array([0x44, 0x44, 0x53, 0x20, 0, 0, 0, 0]))).toBeNull();
    expect(parseDds(buildDds({ fourCC: fourCC('ZZZZ'), height: 4, pfFlags: 0x4, width: 4 }))).toBeNull();
    expect(
      parseDds(buildDds({ caps2: 0x200000, fourCC: fourCC('DXT1'), height: 4, pfFlags: 0x4, width: 4 })),
    ).toBeNull();
  });
});

function buildDdsCube(): Uint8Array {
  return buildDds({ caps2: 0x200, fourCC: fourCC('DXT5'), dataBytes: 96, height: 4, pfFlags: 0x4, width: 4 });
}
