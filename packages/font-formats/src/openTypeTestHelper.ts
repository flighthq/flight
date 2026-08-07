// Synthetic fonts, assembled byte by byte.
//
// THIS FILE IS THE TESTING STRATEGY, NOT A CONVENIENCE. Vendoring a real font into the repository is
// forbidden, and a font this file builds is Flight's own bytes with no provenance attached to them.
// Building the fixture also means every test states the exact table contents its assertion depends on,
// so a failure names a field rather than "the font changed".
//
// Only the tables the reader needs are emitted, with the layout the format specifies.

export interface SyntheticGlyph {
  // Contour end-point indices, matching the format's own `endPtsOfContours`.
  endPoints: readonly number[];
  // One entry per point: [x, y, onCurve].
  points: readonly (readonly [number, number, boolean])[];
}

export interface SyntheticFontOptions {
  advances?: readonly number[];
  // Maps a codepoint to a glyph index; emitted as a cmap format 4 sub-table.
  codepoints?: ReadonlyMap<number, number>;
  glyphs?: readonly SyntheticGlyph[];
  // 'truetype' emits the 0x00010000 sfnt version, 'opentype' emits 'OTTO' with a `CFF ` table and no
  // `glyf`, which is what an unsupported-outlines rejection is tested against.
  flavor?: 'opentype' | 'truetype';
  omitTable?: string;
  unitsPerEm?: number;
}

// A complete, readable TrueType font carrying the requested glyphs.
export function createSyntheticFont(options: Readonly<SyntheticFontOptions> = {}): Uint8Array {
  const flavor = options.flavor ?? 'truetype';
  const unitsPerEm = options.unitsPerEm ?? 1000;
  const glyphs = options.glyphs ?? [emptySyntheticGlyph()];
  const advances = options.advances ?? glyphs.map(() => 500);

  const glyphData = glyphs.map((glyph) => encodeSyntheticGlyph(glyph));
  const locaOffsets: number[] = [0];
  let running = 0;
  for (const data of glyphData) {
    running += data.length;
    locaOffsets.push(running);
  }

  const tables = new Map<string, Uint8Array>();
  tables.set('head', encodeSyntheticHead(unitsPerEm));
  tables.set('hhea', encodeSyntheticHhea(advances.length));
  tables.set('maxp', encodeSyntheticMaxp(glyphs.length));
  tables.set('hmtx', encodeSyntheticHmtx(advances));
  tables.set('cmap', encodeSyntheticCmap(options.codepoints ?? new Map()));
  if (flavor === 'truetype') {
    tables.set('loca', encodeSyntheticLoca(locaOffsets));
    tables.set('glyf', concatenateBytes(glyphData));
  } else {
    // An OTTO container carrying PostScript charstrings. Contents are irrelevant: the reader must
    // reject it on the table's presence, before ever interpreting a charstring.
    tables.set('CFF ', new Uint8Array([1, 0, 4, 1]));
  }
  if (options.omitTable !== undefined) tables.delete(options.omitTable);

  return assembleSfnt(flavor === 'truetype' ? 0x00010000 : 0x4f54544f, tables);
}

export function emptySyntheticGlyph(): SyntheticGlyph {
  return { endPoints: [], points: [] };
}

// A square, all points on-curve — the simplest shape whose corners a reader cannot fudge.
export function squareSyntheticGlyph(size: number): SyntheticGlyph {
  return {
    endPoints: [3],
    points: [
      [0, 0, true],
      [size, 0, true],
      [size, size, true],
      [0, size, true],
    ],
  };
}

function assembleSfnt(sfntVersion: number, tables: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort();
  const headerBytes = 12 + tags.length * 16;
  let total = headerBytes;
  for (const tag of tags) total += align4(tables.get(tag)!.length);

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, sfntVersion);
  view.setUint16(4, tags.length);

  let dataOffset = headerBytes;
  tags.forEach((tag, index) => {
    const record = 12 + index * 16;
    for (let character = 0; character < 4; character += 1) bytes[record + character] = tag.charCodeAt(character);
    const data = tables.get(tag)!;
    view.setUint32(record + 8, dataOffset);
    view.setUint32(record + 12, data.length);
    bytes.set(data, dataOffset);
    dataOffset += align4(data.length);
  });
  return bytes;
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Format 4, one segment per contiguous codepoint run, using the delta form. The required 0xFFFF
// terminator segment is emitted because a reader is entitled to expect it.
function encodeSyntheticCmap(codepoints: ReadonlyMap<number, number>): Uint8Array {
  const entries = [...codepoints.entries()].sort((a, b) => a[0] - b[0]);
  const segments = entries.map(([codePoint, glyph]) => ({
    delta: (glyph - codePoint) & 0xffff,
    end: codePoint,
    start: codePoint,
  }));
  segments.push({ delta: 1, end: 0xffff, start: 0xffff });

  const segmentCount = segments.length;
  const subtableLength = 16 + segmentCount * 8;
  const bytes = new Uint8Array(4 + 8 + subtableLength);
  const view = new DataView(bytes.buffer);

  view.setUint16(2, 1);
  view.setUint16(4, 3);
  view.setUint16(6, 1);
  view.setUint32(8, 12);

  const table = 12;
  view.setUint16(table, 4);
  view.setUint16(table + 2, subtableLength);
  view.setUint16(table + 6, segmentCount * 2);

  const ends = table + 14;
  const starts = ends + segmentCount * 2 + 2;
  const deltas = starts + segmentCount * 2;
  const ranges = deltas + segmentCount * 2;
  segments.forEach((segment, index) => {
    view.setUint16(ends + index * 2, segment.end);
    view.setUint16(starts + index * 2, segment.start);
    view.setUint16(deltas + index * 2, segment.delta);
    view.setUint16(ranges + index * 2, 0);
  });
  return bytes;
}

// One glyph: the contour count and bounding box, then end points, an empty hinting program, flags, and
// the delta-encoded coordinates. Flags are written one per point rather than run-length encoded, which
// is valid and keeps the fixture readable.
function encodeSyntheticGlyph(glyph: Readonly<SyntheticGlyph>): Uint8Array {
  if (glyph.points.length === 0) return new Uint8Array(0);

  const contourCount = glyph.endPoints.length;
  const pointCount = glyph.points.length;
  const bytes = new Uint8Array(10 + contourCount * 2 + 2 + pointCount * 5);
  const view = new DataView(bytes.buffer);

  view.setInt16(0, contourCount);
  let cursor = 10;
  for (const end of glyph.endPoints) {
    view.setUint16(cursor, end);
    cursor += 2;
  }
  view.setUint16(cursor, 0);
  cursor += 2;

  // Flag 0x01 = on-curve. Neither short bit is set, so every coordinate is a signed 16-bit delta.
  for (const point of glyph.points) {
    view.setUint8(cursor, point[2] ? 0x01 : 0x00);
    cursor += 1;
  }
  let previous = 0;
  for (const point of glyph.points) {
    view.setInt16(cursor, point[0] - previous);
    previous = point[0];
    cursor += 2;
  }
  previous = 0;
  for (const point of glyph.points) {
    view.setInt16(cursor, point[1] - previous);
    previous = point[1];
    cursor += 2;
  }
  return bytes;
}

function encodeSyntheticHead(unitsPerEm: number): Uint8Array {
  const bytes = new Uint8Array(54);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(18, unitsPerEm);
  // indexToLocFormat 1 — 32-bit `loca` entries, so the fixture never depends on the halving rule.
  view.setInt16(50, 1);
  return bytes;
}

function encodeSyntheticHhea(longMetricCount: number): Uint8Array {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);
  view.setInt16(4, 800);
  // Stored negative, as the format states; the reader flips it to a positive descent.
  view.setInt16(6, -200);
  view.setInt16(8, 100);
  view.setUint16(34, longMetricCount);
  return bytes;
}

function encodeSyntheticHmtx(advances: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(advances.length * 4);
  const view = new DataView(bytes.buffer);
  advances.forEach((advance, index) => view.setUint16(index * 4, advance));
  return bytes;
}

function encodeSyntheticLoca(offsets: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(offsets.length * 4);
  const view = new DataView(bytes.buffer);
  offsets.forEach((offset, index) => view.setUint32(index * 4, offset));
  return bytes;
}

function encodeSyntheticMaxp(glyphCount: number): Uint8Array {
  const bytes = new Uint8Array(6);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, glyphCount);
  return bytes;
}
