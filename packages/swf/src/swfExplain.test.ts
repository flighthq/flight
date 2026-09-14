import { registerDecompressor, unregisterDecompressor } from '@flighthq/compression/contract';
import { Compression, CompressionFraming } from '@flighthq/types/contract';

import { explainSwfContent } from './swfExplain';

describe('explainSwfContent', () => {
  afterEach(() => unregisterDecompressor(Compression.Deflate));

  it('returns null for empty input', () => {
    expect(explainSwfContent(new Uint8Array())).toBeNull();
  });

  it('returns null for input too small to be a valid SWF', () => {
    expect(explainSwfContent(new Uint8Array([0x46, 0x57, 0x53]))).toBeNull();
  });

  it('returns a manifest for a minimal valid SWF', () => {
    const swf = createSwf([
      createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const manifest = explainSwfContent(swf);
    expect(manifest).not.toBeNull();
    expect(manifest!.frameRate).toBe(24);
    expect(manifest!.totalTags).toBe(2);
    const bgEntry = manifest!.entries.find((e) => e.code === TAG_SET_BACKGROUND_COLOR);
    expect(bgEntry).toBeDefined();
    expect(bgEntry!.count).toBe(1);
    expect(bgEntry!.handled).toBe(true);
    expect(bgEntry!.name).toBe('SetBackgroundColor');
  });

  it('counts multiple occurrences of the same tag', () => {
    const shape = createMinimalShapeBody();
    const swf = createSwf([
      createTag(TAG_DEFINE_SHAPE, shape),
      createTag(TAG_DEFINE_SHAPE, shape),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const manifest = explainSwfContent(swf)!;
    const shapeEntry = manifest.entries.find((e) => e.code === TAG_DEFINE_SHAPE);
    expect(shapeEntry!.count).toBe(2);
  });

  it('distinguishes a known unregistered tag from an unknown code', () => {
    const swf = createSwf([
      createTag(TAG_PROTECT, new Uint8Array([0])),
      createTag(TAG_UNKNOWN, new Uint8Array([1, 2, 3])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const manifest = explainSwfContent(swf)!;
    const protectEntry = manifest.entries.find((e) => e.code === TAG_PROTECT);
    const unknownEntry = manifest.entries.find((e) => e.code === TAG_UNKNOWN);
    expect(protectEntry).toEqual({ code: TAG_PROTECT, count: 1, handled: false, name: 'Protect' });
    expect(unknownEntry).toEqual({ code: TAG_UNKNOWN, count: 1, handled: false, name: `Unknown(${TAG_UNKNOWN})` });
  });

  it('returns stage bounds in CSS pixels', () => {
    const swf = createSwf([createTag(TAG_END)]);
    const manifest = explainSwfContent(swf)!;
    expect(manifest.stageBounds!.width).toBe(100);
    expect(manifest.stageBounds!.height).toBe(50);
  });

  it('clamps inverted stage extents consistently with the importer', () => {
    const manifest = explainSwfContent(createSwf([createTag(TAG_END)], 24, [2000, 0, 1000, 0]))!;
    expect(manifest.stageBounds).toEqual({ height: 0, width: 0, x: 100, y: 50 });
  });

  it('preserves a fractional 8.8 frame rate', () => {
    const manifest = explainSwfContent(createSwf([createTag(TAG_END)], 23.5))!;
    expect(manifest.frameRate).toBe(23.5);
  });

  it('uses the declared file length as the tag-stream boundary', () => {
    const declared = createSwf([createTag(TAG_SHOW_FRAME)]);
    const withTrailingTag = joinBytes(declared, createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([1, 2, 3])));
    const manifest = explainSwfContent(withTrailingTag)!;
    expect(manifest.totalTags).toBe(1);
    expect(manifest.entries.map((entry) => entry.code)).toEqual([TAG_SHOW_FRAME]);
  });

  it('rejects invalid declared lengths and truncated tag records', () => {
    const tooLong = createSwf([createTag(TAG_END)]);
    tooLong.set(uint32(tooLong.length + 1), 4);
    expect(explainSwfContent(tooLong)).toBeNull();

    const tooShort = createSwf([createTag(TAG_END)]);
    tooShort.set(uint32(11), 4);
    expect(explainSwfContent(tooShort)).toBeNull();

    const zeroVersion = createSwf([createTag(TAG_END)]);
    zeroVersion[3] = 0;
    expect(explainSwfContent(zeroVersion)).toBeNull();

    expect(explainSwfContent(createSwf([createTag(TAG_SHOW_FRAME), new Uint8Array([0xff])]))).toBeNull();
    expect(
      explainSwfContent(createSwf([joinBytes(uint16((TAG_DEFINE_SHAPE << 6) | 0x3f), uint32(64), new Uint8Array(63))])),
    ).toBeNull();
    expect(
      explainSwfContent(createSwf([joinBytes(uint16((TAG_DEFINE_SHAPE << 6) | 0x3f), uint32(0x80000000))])),
    ).toBeNull();
  });

  it('skips short and extended tag bodies without parsing their payloads', () => {
    const opaquePayload = new Uint8Array(63);
    opaquePayload.fill(0xff);
    const manifest = explainSwfContent(
      createSwf([
        createTag(TAG_PROTECT, new Uint8Array([0xff])),
        createTag(TAG_DEFINE_SHAPE, opaquePayload),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
    )!;
    expect(manifest.totalTags).toBe(3);
    expect(manifest.entries.map(({ code, count }) => ({ code, count }))).toEqual([
      { code: TAG_SHOW_FRAME, count: 1 },
      { code: TAG_DEFINE_SHAPE, count: 1 },
      { code: TAG_PROTECT, count: 1 },
    ]);
  });

  it('counts ShowFrame but stops before End and every tag after it', () => {
    const manifest = explainSwfContent(
      createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END), createTag(TAG_SHOW_FRAME)]),
    )!;
    expect(manifest.totalTags).toBe(1);
    expect(manifest.entries).toMatchObject([{ code: TAG_SHOW_FRAME, count: 1, handled: true, name: 'ShowFrame' }]);
  });

  it('returns the same manifest for registered compressed input', () => {
    const uncompressed = createSwf([
      createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
      createTag(TAG_SHOW_FRAME),
      createTag(TAG_END),
    ]);
    const compressed = joinBytes(uncompressed.subarray(0, 8), new Uint8Array(uncompressed.subarray(8)).reverse());
    compressed[0] = 0x43;

    expect(explainSwfContent(compressed)).toBeNull();
    registerDecompressor(Compression.Deflate, (body, uncompressedLength, framing) => {
      expect(uncompressedLength).toBe(uncompressed.length - 8);
      expect(framing).toBe(CompressionFraming.Rfc1950);
      return new Uint8Array(body).reverse();
    });
    expect(explainSwfContent(compressed)).toEqual(explainSwfContent(uncompressed));
  });
});

function createSwf(
  tags: ReadonlyArray<Uint8Array>,
  frameRate = 24,
  stageBounds: readonly [number, number, number, number] = [0, 2000, 0, 1000],
): Uint8Array {
  const body = joinBytes(createRectangle(...stageBounds), uint16(frameRate * 256), uint16(1), ...tags);
  const fileLength = SWF_PREFIX_LENGTH + body.length;
  return joinBytes(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(fileLength), body);
}

function createMinimalShapeBody(): Uint8Array {
  return joinBytes(uint16(1), createRectangle(0, 100, 0, 100), new Uint8Array([0, 0]));
}

function createRectangle(xMin: number, xMax: number, yMin: number, yMax: number): Uint8Array {
  const values = [xMin, xMax, yMin, yMax];
  const bits = signedBitCount(values);
  const totalBits = 5 + bits * 4;
  const totalBytes = Math.ceil(totalBits / 8);
  const result = new Uint8Array(totalBytes);
  let bitPos = 0;
  const writeBits = (value: number, count: number): void => {
    for (let i = count - 1; i >= 0; i--) {
      const byteIndex = bitPos >> 3;
      const bitIndex = 7 - (bitPos & 7);
      if ((value >> i) & 1) result[byteIndex] |= 1 << bitIndex;
      bitPos++;
    }
  };
  writeBits(bits, 5);
  for (const value of values) writeBits(value & ((1 << bits) - 1), bits);
  return result;
}

function createTag(code: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  const header = uint16((code << 6) | shortLength);
  return shortLength === 0x3f ? joinBytes(header, uint32(body.length), body) : joinBytes(header, body);
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function signedBitCount(values: ReadonlyArray<number>): number {
  for (let bits = 1; bits < 32; bits++) {
    const minimum = -(2 ** (bits - 1));
    const maximum = 2 ** (bits - 1) - 1;
    if (values.every((value) => value >= minimum && value <= maximum)) return bits;
  }
  return 32;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

const SWF_PREFIX_LENGTH = 8;
const TAG_DEFINE_SHAPE = 2;
const TAG_END = 0;
const TAG_PROTECT = 24;
const TAG_SET_BACKGROUND_COLOR = 9;
const TAG_SHOW_FRAME = 1;
const TAG_UNKNOWN = 100;
