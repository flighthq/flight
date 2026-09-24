import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { parseSwfRequirements } from './swfRequirements';

describe('parseSwfRequirements', () => {
  it('reports one requirement per distinct tag, keyed by the SWF tag name', () => {
    const set = parseSwfRequirements(
      createSwf([
        createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
        createTag(TAG_DEFINE_SHAPE, createMinimalShapeBody()),
        createTag(TAG_END),
      ]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: 'DefineShape' },
      { facet: RequirementFacet.DocumentFormat, key: 'SetBackgroundColor' },
    ]);
  });

  it('declares the facet it inspected, so absence is evidence', () => {
    const set = parseSwfRequirements(createSwf([createTag(TAG_END)]), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });

  it('collapses repeats: a requirement is what the file needs, not how often', () => {
    const shape = createMinimalShapeBody();
    const set = parseSwfRequirements(
      createSwf([createTag(TAG_DEFINE_SHAPE, shape), createTag(TAG_DEFINE_SHAPE, shape), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'DefineShape' }]);
  });

  it('keeps a tag this build does not name rather than shrinking the inventory', () => {
    const set = parseSwfRequirements(
      createSwf([createTag(TAG_UNKNOWN, new Uint8Array([1, 2, 3])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: `Unknown(${TAG_UNKNOWN})` }]);
  });

  it('reports an unregistered tag exactly like a registered one, carrying no registrar identity', () => {
    // Both tags below carry scene content, so both are requirements. Whether a handler happens to be
    // registered for one is not visible here — that is the consumer's business, not the producer's.
    const set = parseSwfRequirements(
      createSwf([
        createTag(TAG_DEFINE_SHAPE, createMinimalShapeBody()),
        createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
        createTag(TAG_END),
      ]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: 'DefineShape' },
      { facet: RequirementFacet.DocumentFormat, key: 'SetBackgroundColor' },
    ]);
  });

  // Downstream report: a complete, correct build warned six times per SWF for kinds no catalog row
  // could ever answer. Five were metadata tags the timeline walk already skips; the sixth was
  // ShowFrame, which the walk consumes structurally. A permanently unresolvable warning on every build
  // teaches a reader to ignore the channel that reports a genuinely missing handler.
  it.each([
    ['FileAttributes', 69],
    ['Metadata', 77],
    ['CSMTextSettings', 74],
    ['DefineFontAlignZones', 73],
    ['DefineFontName', 88],
    ['Protect', TAG_PROTECT],
  ])('emits no requirement for %s, which carries no scene content', (_name, code) => {
    const set = parseSwfRequirements(
      createSwf([createTag(code, new Uint8Array([1])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([]);
  });

  it('emits no requirement for ShowFrame, which the walk consumes structurally', () => {
    const set = parseSwfRequirements(
      createSwf([createTag(TAG_SHOW_FRAME), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([]);
  });

  it('STILL reports an unrecognized tag — that gap is real and is what the channel is for', () => {
    const set = parseSwfRequirements(
      createSwf([createTag(TAG_UNKNOWN, new Uint8Array([1])), createTag(TAG_END)]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: `Unknown(${TAG_UNKNOWN})` }]);
  });

  it('still reports content tags beside excluded ones, so exclusion is not over-broad', () => {
    const set = parseSwfRequirements(
      createSwf([
        createTag(69, new Uint8Array([1])),
        createTag(TAG_SHOW_FRAME),
        createTag(TAG_SET_BACKGROUND_COLOR, new Uint8Array([0xff, 0xff, 0xff])),
        createTag(TAG_END),
      ]),
      DECOMPRESS_DEFLATE,
      DECOMPRESS_LZMA,
    );
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'SetBackgroundColor' }]);
  });

  it('returns an empty set that still declares coverage when the source is unreadable', () => {
    const set = parseSwfRequirements(new Uint8Array(), DECOMPRESS_DEFLATE, DECOMPRESS_LZMA);
    expect(set.requirements).toEqual([]);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
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
