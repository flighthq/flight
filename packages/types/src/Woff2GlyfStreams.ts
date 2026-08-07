// The seven sub-streams a transformed `glyf` table is split into, plus the two counts needed to walk
// them. A `glyf` table interleaves each glyph's contour count, flags, coordinates and hinting bytecode;
// the transform separates those so like values sit together and compress well. Reversing it is a
// re-interleave, which is why every stream is carried at once rather than read independently.
export interface Woff2GlyfStreams {
  // Explicit bounding boxes, preceded by a one-bit-per-glyph bitmap saying which glyphs have one.
  // Composite glyphs must carry theirs; simple glyphs usually have theirs recomputed from their points.
  bboxStream: Readonly<Uint8Array>;
  compositeStream: Readonly<Uint8Array>;
  // One flag byte per point, across every glyph in order, carrying the on-curve bit and the code that
  // says how that point's coordinate delta is encoded in `glyphStream`.
  flagStream: Readonly<Uint8Array>;
  glyphCount: number;
  // Point coordinate deltas and instruction lengths.
  glyphStream: Readonly<Uint8Array>;
  // Which width `loca` uses: 0 for the short form storing halved offsets, 1 for the long form.
  indexFormat: number;
  instructionStream: Readonly<Uint8Array>;
  // One int16 per glyph: contour count, negative for a composite glyph and zero for an empty one.
  nContourStream: Readonly<Uint8Array>;
  // Points per contour, as 255UInt16 values.
  nPointsStream: Readonly<Uint8Array>;
}
