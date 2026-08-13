import type { Decompressor, Woff2TableDirectory, Woff2TableEntry } from '@flighthq/types/contract';
import { Compression, CompressionFraming } from '@flighthq/types/contract';

import { assembleSfntFont, packSfntTag } from './sfntAssembly';

// WOFF2 is WOFF's wrapper idea taken two steps further, and both steps are why it needs its own reader
// rather than a flag on the WOFF one.
//
//   1. ONE Brotli STREAM FOR THE WHOLE FONT, not one deflate stream per table. Tables are concatenated
//      before compression, so nothing can be read until the entire stream is decompressed, and the
//      directory carries lengths rather than offsets — there are no offsets to carry.
//   2. TABLES MAY BE *TRANSFORMED*, not merely compressed. A transformed table is not the sfnt table in
//      compressed form; it is a different byte layout that must be reversed to get the table back.
//
// The container layout is an interface fact about the format. The reading is Flight's own.
//
// ★ NO DECOMPRESSOR AND NO DICTIONARY SHIP WITH THIS. Brotli's decoder needs a large static dictionary
// that is data rather than rules, so Flight registers nothing and the caller registers a decompressor
// they already have — `zlib` on Node, an ordinary package in a browser. That is the same registry seam
// WOFF already uses, and it keeps a `.ttf` reader from carrying a codec it never calls.

const WOFF2_HEADER_BYTES = 48;

// The 63 tags a directory entry can name by index instead of spelling out. The order is fixed by the
// format — index 63 means an arbitrary tag follows as four bytes instead.
const WOFF2_KNOWN_TAGS: readonly string[] = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

// The compression this container uses. Named through the shared vocabulary rather than a local constant
// so a caller registering a codec and this module asking for one cannot drift apart.
export const WOFF2_COMPRESSION: Compression = Compression.Brotli;

// Rebuilds the plain sfnt a WOFF2 wraps. Returns the null sentinel for a malformed container, for a
// missing decompressor, and for a transform this package cannot reverse — the caller distinguishes those
// through `explainOpenTypeFont`, because the remedies are a repaired file, one line of registration, and
// a different producer respectively.
export function readWoff2Font(
  bytes: Readonly<Uint8Array>,
  decompress: Decompressor | null,
  reverseTransform:
    | ((tag: string, transformed: Readonly<Uint8Array>, tables: ReadonlyMap<string, Uint8Array>) => Uint8Array | null)
    | null,
): Uint8Array | null {
  const directory = readWoff2TableDirectory(bytes);
  if (directory === null) return null;
  if (decompress === null) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flavor = view.getUint32(4);
  const totalCompressedSize = view.getUint32(20);
  // The compressed stream begins immediately after the directory, whose length is only known once it has
  // been walked. Deriving the start from the end of the file instead lands inside the format's trailing
  // padding, which decodes as a valid but empty stream rather than failing.
  const streamEnd = directory.streamStart + totalCompressedSize;
  if (streamEnd > bytes.byteLength) return null;

  const stream = decompress(
    bytes.subarray(directory.streamStart, streamEnd),
    directory.totalUncompressedLength,
    CompressionFraming.Raw,
  );
  if (stream === null || stream.byteLength < directory.totalUncompressedLength) return null;

  // Tables sit end to end in the decompressed stream, in directory order, each occupying its transformed
  // length where it was transformed and its original length where it was not.
  const raw = new Map<string, Uint8Array>();
  let at = 0;
  for (const entry of directory.entries) {
    const length = entry.transformed ? entry.transformLength : entry.originalLength;
    if (at + length > stream.byteLength) return null;
    raw.set(entry.tag, stream.subarray(at, at + length));
    at += length;
  }

  const tables: { data: Readonly<Uint8Array>; tag: number }[] = [];
  for (const entry of directory.entries) {
    const stored = raw.get(entry.tag)!;
    if (!entry.transformed) {
      tables.push({ data: stored, tag: packSfntTag(entry.tag) });
      continue;
    }
    // A transform this package cannot reverse is refused rather than passed through. Emitting the
    // transformed bytes under the table's own tag would produce a font whose directory says `glyf` over
    // something that is not a `glyf` — readable, wrong, and silent.
    if (reverseTransform === null) return null;
    const restored = reverseTransform(entry.tag, stored, raw);
    if (restored === null) return null;
    tables.push({ data: restored, tag: packSfntTag(entry.tag) });
  }

  return assembleSfntFont(flavor, tables);
}

// The directory a WOFF2 carries in place of sfnt's offset table: one variable-length record per table,
// naming a tag, whether it was transformed, and the lengths on both sides of that transform. Returns the
// null sentinel rather than a partial directory, since a desynchronised walk yields entries whose tags
// and lengths are real values read at the wrong offsets.
export function readWoff2TableDirectory(bytes: Readonly<Uint8Array>): Woff2TableDirectory | null {
  if (bytes.byteLength < WOFF2_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const tableCount = view.getUint16(12);
  if (tableCount === 0) return null;

  const cursor = { at: WOFF2_HEADER_BYTES };
  const entries: Woff2TableEntry[] = [];
  let totalUncompressedLength = 0;

  for (let index = 0; index < tableCount; index += 1) {
    if (cursor.at >= bytes.byteLength) return null;
    const flags = view.getUint8(cursor.at);
    cursor.at += 1;

    const tagIndex = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;

    let tag: string;
    if (tagIndex === 0x3f) {
      if (cursor.at + 4 > bytes.byteLength) return null;
      tag = String.fromCharCode(
        view.getUint8(cursor.at),
        view.getUint8(cursor.at + 1),
        view.getUint8(cursor.at + 2),
        view.getUint8(cursor.at + 3),
      );
      cursor.at += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[tagIndex]!;
    }

    const originalLength = readWoff2Base128(view, cursor, bytes.byteLength);
    if (originalLength < 0) return null;

    // The sense of `transformVersion` is INVERTED for the glyph pair, and getting this backwards is the
    // mistake that reads a length field that is not there: for `glyf` and `loca`, version 3 means the
    // null transform, while for every other table it is version 0 that means untransformed.
    const isGlyphPair = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyphPair ? transformVersion !== 3 : transformVersion !== 0;

    let transformLength = originalLength;
    if (transformed) {
      transformLength = readWoff2Base128(view, cursor, bytes.byteLength);
      if (transformLength < 0) return null;
    }

    entries.push({ originalLength, tag, transformLength, transformVersion, transformed });
    totalUncompressedLength += transformed ? transformLength : originalLength;
  }

  return { entries, streamStart: cursor.at, totalUncompressedLength };
}

// UIntBase128: seven bits per byte, most significant first, high bit set on every byte but the last.
// Returns -1 for an unterminated or over-long value rather than a truncated number, so a caller cannot
// mistake a malformed length for a small one. Five bytes is the most a 32-bit value can occupy, and a
// leading zero byte is disallowed because it makes one value spellable two ways.
function readWoff2Base128(view: Readonly<DataView>, cursor: { at: number }, end: number): number {
  let value = 0;
  for (let byte = 0; byte < 5; byte += 1) {
    if (cursor.at >= end) return -1;
    const next = view.getUint8(cursor.at);
    cursor.at += 1;
    if (byte === 0 && next === 0x80) return -1;
    value = value * 128 + (next & 0x7f);
    if ((next & 0x80) === 0) return value > 0xffffffff ? -1 : value;
  }
  return -1;
}
