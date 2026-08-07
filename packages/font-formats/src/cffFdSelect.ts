// FDSelect: which font DICT each glyph belongs to.
//
// A CID-keyed font is several fonts in one table. Rather than a single Private DICT, it carries an
// FDArray of font DICTs, each with its own Private DICT and therefore ITS OWN LOCAL SUBROUTINE POOL.
// FDSelect is the map from glyph index to which of those a glyph uses.
//
// ★ WHY THIS EXISTS AT ALL, WHICH IS THE WHOLE REASON CID FONTS WERE REFUSED UNTIL NOW: binding every
// glyph to one pool is not a partial implementation, it is a WRONG one. The subroutine index is biased
// by pool size, so an index valid in one pool selects a different, real entry in another — and a real
// entry draws something. The failure is per-glyph plausible geometry rather than an error.
//
// Two encodings exist and both are read: format 0 is one byte per glyph, format 3 is ranges. The layouts
// are interface facts about the format; the lookup below is Flight's own.

// Returns a dense glyph-index → FD-index array, so the per-glyph lookup in the outline path is a single
// indexed read rather than a range search. Ranges are expanded once here for the same reason the cmap is:
// the alternative pays a search on every glyph, inside text layout.
//
// Returns the null sentinel for a malformed table rather than a partial map. A partially-read FDSelect
// would silently bind the unmapped tail of the glyph range to FD 0 — which is exactly the wrong-pool
// outcome this whole module exists to prevent.
export function readCffFdSelect(bytes: Readonly<Uint8Array>, offset: number, glyphCount: number): Uint8Array | null {
  if (offset + 1 > bytes.byteLength) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint8(offset);

  if (format === 0) {
    if (offset + 1 + glyphCount > bytes.byteLength) return null;
    const select = new Uint8Array(glyphCount);
    for (let glyph = 0; glyph < glyphCount; glyph += 1) select[glyph] = view.getUint8(offset + 1 + glyph);
    return select;
  }

  if (format !== 3) return null;

  if (offset + 5 > bytes.byteLength) return null;
  const rangeCount = view.getUint16(offset + 1);
  // Each range is a 3-byte record, and a trailing sentinel gives the end of the final range.
  const sentinelAt = offset + 3 + rangeCount * 3;
  if (sentinelAt + 2 > bytes.byteLength) return null;

  const select = new Uint8Array(glyphCount);
  let covered = 0;
  for (let range = 0; range < rangeCount; range += 1) {
    const first = view.getUint16(offset + 3 + range * 3);
    const fd = view.getUint8(offset + 5 + range * 3);
    // The next range's first glyph is this one's end; the last is bounded by the trailing sentinel.
    const next = range + 1 < rangeCount ? view.getUint16(offset + 3 + (range + 1) * 3) : view.getUint16(sentinelAt);
    if (next < first || next > glyphCount) return null;
    for (let glyph = first; glyph < next; glyph += 1) select[glyph] = fd;
    covered = Math.max(covered, next);
  }

  // A range set that does not reach the end of the glyph range leaves a tail bound to FD 0 by default,
  // which is the silent wrong-pool case. Refused rather than accepted with a plausible-looking map.
  return covered === glyphCount ? select : null;
}
