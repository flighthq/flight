import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';

import { collectSwfContentCapabilities } from './swfContentCapabilities.ts';

describe('collectSwfContentCapabilities', () => {
  it('counts each distinct tag code', () => {
    const result = collectSwfContentCapabilities(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, createMinimalShapeBody()),
        createTag(TAG_DEFINE_SHAPE, createMinimalShapeBody()),
        createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
        createTag(TAG_END),
      ]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.tagCounts.get(TAG_DEFINE_SHAPE)).toBe(2);
    expect(result!.tagCounts.get(TAG_SET_BACKGROUND_COLOR)).toBe(1);
  });

  it('detects blend mode from PlaceObject3 extended flags', () => {
    const placeBody = new Uint8Array([0x00, 0x02, 0x01, 0x00]);
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_PLACE_OBJECT_3, placeBody), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesBlendMode).toBe(true);
    expect(result!.usesFilters).toBe(false);
  });

  it('detects filters from PlaceObject3 extended flags', () => {
    const placeBody = new Uint8Array([0x00, 0x01, 0x01, 0x00]);
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_PLACE_OBJECT_3, placeBody), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesFilters).toBe(true);
    expect(result!.usesBlendMode).toBe(false);
  });

  it('detects blend mode from PlaceObject4', () => {
    const placeBody = new Uint8Array([0x00, 0x02, 0x01, 0x00]);
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_PLACE_OBJECT_4, placeBody), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesBlendMode).toBe(true);
  });

  it('detects bitmap fills from bitmap character tags', () => {
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_DEFINE_BITS_JPEG2, new Uint8Array([0x01, 0x00, 0xff, 0xd8])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesBitmapFills).toBe(true);
  });

  it('reports no capabilities when no relevant tags are present', () => {
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesBlendMode).toBe(false);
    expect(result!.usesFilters).toBe(false);
    expect(result!.usesBitmapFills).toBe(false);
  });

  it('returns null for unreadable input', () => {
    expect(collectSwfContentCapabilities(new Uint8Array(), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();
  });

  it('ignores PlaceObject3 bodies shorter than 2 bytes', () => {
    const result = collectSwfContentCapabilities(
      createSwf([createTag(TAG_PLACE_OBJECT_3, new Uint8Array([0x00])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(result).not.toBeNull();
    expect(result!.usesBlendMode).toBe(false);
    expect(result!.usesFilters).toBe(false);
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
const TAG_DEFINE_BITS_JPEG2 = 21;
const TAG_DEFINE_SHAPE = 2;
const TAG_END = 0;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_SET_BACKGROUND_COLOR = 9;

const DECOMPRESS_DEFLATE = sdkHostDecompressDeflate;
const DECOMPRESS_LZMA = null;
