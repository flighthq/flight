import type { SfntTableDirectory } from '@flighthq/types/contract';

// The codepoint → glyph-index map. `cmap` is a table of sub-tables, each tagged with a platform and
// encoding, because a font may carry several mappings for different systems. Only the Unicode ones are
// read here: the format's job is to say which glyph draws a codepoint, and the legacy platform-specific
// encodings answer a different question that nothing in this SDK asks.
//
// Two sub-table formats are read, and between them they cover every modern font:
//   format 4  — segmented ranges over the Basic Multilingual Plane. Effectively universal.
//   format 12 — flat 32-bit groups, which is how anything above U+FFFF is reached at all.
// A font carrying neither maps nothing, and every codepoint lookup returns -1 rather than guessing.

// Picks the best Unicode sub-table the font offers, preferring one that can express codepoints above
// the BMP. Returns -1 when the font declares no Unicode mapping this reader can read.
//
// Platform 3 encoding 10 and platform 0 encoding 4/6 are the full-repertoire mappings; platform 3
// encoding 1 and platform 0 encodings 0-3 are BMP-only. Preferring the former matters for emoji and for
// CJK extensions, which is exactly the material a BMP-only map silently drops.
//
// ★ READABILITY IS PART OF THE CHOICE, NOT A TEST APPLIED AFTERWARDS. Ranking on encoding alone picks
// the widest-repertoire sub-table even when it is stored in a format this reader does not implement,
// and the font is then refused whole while a readable sub-table sits beside it. That is not
// hypothetical: a real font in this shape carries a readable format 4 at rank 1 and a format 0 at
// rank 2, and ranking alone rejected the entire font. A narrower map that works beats a wider one that
// cannot be read.
export function findOpenTypeUnicodeSubtable(
  view: Readonly<DataView>,
  cmapOffset: number,
  cmapLength: number,
  byteLength: number,
): number {
  const recordCount = view.getUint16(cmapOffset + 2);
  let best = -1;
  let bestRank = -1;

  for (let index = 0; index < recordCount; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    if (record + 8 > cmapOffset + cmapLength || record + 8 > byteLength) break;

    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmapOffset + view.getUint32(record + 4);
    if (offset + 4 > byteLength) continue;

    const rank = rankOpenTypeUnicodeEncoding(platform, encoding);
    if (rank <= bestRank) continue;
    if (!isOpenTypeCmapFormatReadable(view.getUint16(offset))) continue;
    best = offset;
    bestRank = rank;
  }
  return best;
}

// Whether `readOpenTypeCodepointMap` can turn this sub-table format into a map. Kept beside the chooser
// because the two must agree: a format the chooser accepts and the reader then declines produces the
// refusal this function exists to prevent.
function isOpenTypeCmapFormatReadable(format: number): boolean {
  return format === 4 || format === 12;
}

// 2 = full Unicode repertoire, 1 = BMP only, -1 = not a Unicode mapping.
export function rankOpenTypeUnicodeEncoding(platform: number, encoding: number): number {
  if (platform === 3 && encoding === 10) return 2;
  if (platform === 0 && (encoding === 4 || encoding === 6)) return 2;
  if (platform === 3 && encoding === 1) return 1;
  if (platform === 0 && encoding <= 3) return 1;
  return -1;
}

// Builds the map eagerly into a plain Map. A font's cmap is thousands of entries at most, and the
// alternative — binary searching the encoded segments per lookup — trades a one-off parse for a cost on
// every glyph, in a lookup that sits inside text layout.
export function readOpenTypeCodepointMap(
  bytes: Readonly<Uint8Array>,
  directory: Readonly<SfntTableDirectory>,
): Map<number, number> | null {
  const cmap = directory.tables.get('cmap');
  if (cmap === undefined || cmap.length < 4) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const subtableOffset = findOpenTypeUnicodeSubtable(view, cmap.offset, cmap.length, bytes.byteLength);
  if (subtableOffset === -1) return null;

  const format = view.getUint16(subtableOffset);
  if (format === 4) return readOpenTypeCmapFormat4(view, subtableOffset, bytes.byteLength);
  if (format === 12) return readOpenTypeCmapFormat12(view, subtableOffset, bytes.byteLength);
  return null;
}

// Format 4: parallel arrays of segment ends, starts, deltas, and range offsets. A segment either adds a
// constant delta to the codepoint or indexes into a glyph-id array that follows — the second form is
// what lets a font map a scattered range without a segment per character.
function readOpenTypeCmapFormat4(view: Readonly<DataView>, offset: number, byteLength: number): Map<number, number> {
  const map = new Map<number, number>();
  const segmentCount = view.getUint16(offset + 6) / 2;
  const endsAt = offset + 14;
  const startsAt = endsAt + segmentCount * 2 + 2;
  const deltasAt = startsAt + segmentCount * 2;
  const rangesAt = deltasAt + segmentCount * 2;
  if (rangesAt + segmentCount * 2 > byteLength) return map;

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const end = view.getUint16(endsAt + segment * 2);
    const start = view.getUint16(startsAt + segment * 2);
    // The final segment is a required 0xFFFF terminator rather than real coverage.
    if (start > end || start === 0xffff) continue;

    const delta = view.getInt16(deltasAt + segment * 2);
    const rangeOffsetAt = rangesAt + segment * 2;
    const rangeOffset = view.getUint16(rangeOffsetAt);

    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (codePoint + delta) & 0xffff;
      } else {
        // The range offset is a byte distance from its OWN slot, which is why this is computed from
        // `rangeOffsetAt` and not from the start of the table.
        const glyphAt = rangeOffsetAt + rangeOffset + (codePoint - start) * 2;
        if (glyphAt + 2 > byteLength) continue;
        const raw = view.getUint16(glyphAt);
        // A zero here means "no glyph" and must NOT have the delta applied, which would turn an absent
        // glyph into a plausible wrong one.
        if (raw === 0) continue;
        glyph = (raw + delta) & 0xffff;
      }
      if (glyph !== 0) map.set(codePoint, glyph);
    }
  }
  return map;
}

// Format 12: flat groups of contiguous codepoints, each mapping to a contiguous run of glyph ids. The
// only sub-table format that reaches past U+FFFF.
function readOpenTypeCmapFormat12(view: Readonly<DataView>, offset: number, byteLength: number): Map<number, number> {
  const map = new Map<number, number>();
  if (offset + 16 > byteLength) return map;
  const groupCount = view.getUint32(offset + 12);

  for (let group = 0; group < groupCount; group += 1) {
    const record = offset + 16 + group * 12;
    if (record + 12 > byteLength) break;

    const start = view.getUint32(record);
    const end = view.getUint32(record + 4);
    const startGlyph = view.getUint32(record + 8);
    if (start > end) continue;

    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      const glyph = startGlyph + (codePoint - start);
      if (glyph !== 0) map.set(codePoint, glyph);
    }
  }
  return map;
}
