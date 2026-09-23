import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { CompressionFraming } from '@flighthq/types/contract';

import { collectSwfTagCounts, getSwfTagName, parseSwfHeader } from './swfHeader';

describe('collectSwfTagCounts', () => {
  it('returns null for input that is not a readable SWF', () => {
    expect(collectSwfTagCounts(new Uint8Array(), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();
  });

  it('counts multiple occurrences of the same tag', () => {
    const shape = createMinimalShapeBody();
    const counts = collectSwfTagCounts(
      createSwf([createTag(TAG_DEFINE_SHAPE, shape), createTag(TAG_DEFINE_SHAPE, shape), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    )!;
    expect(counts.get(TAG_DEFINE_SHAPE)).toBe(2);
  });

  it('uses the declared file length as the tag-stream boundary', () => {
    const declared = createSwf([createTag(TAG_SHOW_FRAME)]);
    const withTrailingTag = joinBytes(declared, createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([1, 2, 3])));
    const counts = collectSwfTagCounts(withTrailingTag, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)!;
    expect([...counts.keys()]).toEqual([TAG_SHOW_FRAME]);
  });

  it('stops before End and every tag after it', () => {
    const counts = collectSwfTagCounts(
      createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END), createTag(TAG_SHOW_FRAME)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    )!;
    expect(counts.get(TAG_SHOW_FRAME)).toBe(1);
  });

  it('skips short and extended tag bodies without parsing their payloads', () => {
    const opaquePayload = new Uint8Array(63);
    opaquePayload.fill(0xff);
    const counts = collectSwfTagCounts(
      createSwf([
        createTag(TAG_PROTECT, new Uint8Array([0xff])),
        createTag(TAG_DEFINE_SHAPE, opaquePayload),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_END),
      ]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    )!;
    expect([...counts.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [TAG_SHOW_FRAME, 1],
      [TAG_DEFINE_SHAPE, 1],
      [TAG_PROTECT, 1],
    ]);
  });

  it('rejects truncated tag records', () => {
    expect(
      collectSwfTagCounts(
        createSwf([createTag(TAG_SHOW_FRAME), new Uint8Array([0xff])]),
        DECOMPRESS_DEFLATE,
        DECOMPRESS_LZMA,
      ),
    ).toBeNull();
    expect(
      collectSwfTagCounts(
        createSwf([joinBytes(uint16((TAG_DEFINE_SHAPE << 6) | 0x3f), uint32(64), new Uint8Array(63))]),
        DECOMPRESS_DEFLATE,
        DECOMPRESS_LZMA,
      ),
    ).toBeNull();
    expect(
      collectSwfTagCounts(
        createSwf([joinBytes(uint16((TAG_DEFINE_SHAPE << 6) | 0x3f), uint32(0x80000000))]),
        DECOMPRESS_DEFLATE,
        DECOMPRESS_LZMA,
      ),
    ).toBeNull();
  });
});

describe('getSwfTagName', () => {
  it('names a known tag code', () => {
    expect(getSwfTagName(TAG_SET_BACKGROUND_COLOR)).toBe('SetBackgroundColor');
    expect(getSwfTagName(TAG_PROTECT)).toBe('Protect');
  });

  it('labels an unnamed code stably rather than dropping it', () => {
    expect(getSwfTagName(TAG_UNKNOWN)).toBe(`Unknown(${TAG_UNKNOWN})`);
  });
});

describe('parseSwfHeader', () => {
  it('returns null for empty input', () => {
    expect(parseSwfHeader(new Uint8Array(), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();
  });

  it('returns null for input too small to be a valid SWF', () => {
    expect(parseSwfHeader(new Uint8Array([0x46, 0x57, 0x53]), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();
  });

  it('reads version, file length, frame rate and stage bounds', () => {
    const swf = createSwf([createTag(TAG_END)]);
    const header = parseSwfHeader(swf, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)!;
    expect(header.version).toBe(9);
    expect(header.fileLength).toBe(swf.length);
    expect(header.frameRate).toBe(24);
    expect(header.stageBounds.width).toBe(100);
    expect(header.stageBounds.height).toBe(50);
  });

  it('clamps inverted stage extents consistently with the importer', () => {
    const header = parseSwfHeader(
      createSwf([createTag(TAG_END)], 24, [2000, 0, 1000, 0]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    )!;
    expect(header.stageBounds).toEqual({ height: 0, width: 0, x: 100, y: 50 });
  });

  it('preserves a fractional 8.8 frame rate', () => {
    const header = parseSwfHeader(createSwf([createTag(TAG_END)], 23.5), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)!;
    expect(header.frameRate).toBe(23.5);
  });

  it('rejects invalid declared lengths and a zero version', () => {
    const tooLong = createSwf([createTag(TAG_END)]);
    tooLong.set(uint32(tooLong.length + 1), 4);
    expect(parseSwfHeader(tooLong, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();

    const tooShort = createSwf([createTag(TAG_END)]);
    tooShort.set(uint32(11), 4);
    expect(parseSwfHeader(tooShort, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();

    const zeroVersion = createSwf([createTag(TAG_END)]);
    zeroVersion[3] = 0;
    expect(parseSwfHeader(zeroVersion, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA)).toBeNull();
  });

  it('reads a compressed container to the same header as its uncompressed form', () => {
    const uncompressed = createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]);
    const compressed = joinBytes(uncompressed.subarray(0, 8), new Uint8Array(uncompressed.subarray(8)).reverse());
    compressed[0] = 0x43;

    expect(parseSwfHeader(compressed, null, null)).toBeNull();
    const reversing = {
      decompress: (body: Readonly<Uint8Array>, uncompressedLength: number, framing: CompressionFraming) => {
        expect(uncompressedLength).toBe(uncompressed.length - 8);
        expect(framing).toBe(CompressionFraming.Rfc1950);
        return new Uint8Array(body).reverse();
      },
    };
    expect(parseSwfHeader(compressed, reversing, null)).toEqual(
      parseSwfHeader(uncompressed, DECOMPRESS_DEFLATE, DECOMPRESS_LZMA),
    );
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

const DECOMPRESS_DEFLATE = sdkHostDecompressDeflate;
// No LZMA implementation ships with Flight, so a ZWS/LZMA body reports an unread container.
const DECOMPRESS_LZMA = null;
