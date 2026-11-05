// The `CFF ` table's containers, as an outline reader needs them.
//
// An INDEX is the container every other CFF structure is stored in: a count, an offset width, `count + 1`
// offsets, then the data those offsets carve up. Offsets are 1-based from the byte before the data block,
// which is why an entry is carried here as an absolute byte range rather than as the raw offset pair — the
// adjustment belongs to whoever reads the container, not to everyone who consumes one.
export interface CffIndex {
  // Byte offset just past the INDEX, so the next structure is readable without recomputing the layout.
  endOffset: number;
  entries: readonly CffIndexEntry[];
}

export interface CffIndexEntry {
  end: number;
  start: number;
}

// The parts of a `CFF ` table needed to produce outlines: the charstrings, and the two subroutine pools
// they call into. Local and global are separate because charstrings select between them by operator, and
// each pool's index bias depends on its own size.
export interface CffTable {
  charstrings: readonly CffIndexEntry[];
  globalSubrs: readonly CffIndexEntry[];
  // The single table-wide pool a non-CID font carries. Empty when `localSubrsByGlyph` is populated, so a
  // reader that ignored the CID case would run every glyph against an empty pool and fail visibly rather
  // than silently using a pool that is real but belongs to a different font DICT.
  localSubrs: readonly CffIndexEntry[];
  // One pool per glyph, present only for a CID-keyed font. A CID font is several fonts in one table: each
  // font DICT in its FDArray owns a private DICT and therefore its own subroutines, and FDSelect says
  // which glyph uses which. Binding every glyph to one pool would not fail — subroutine indices are
  // biased by pool size, so an index valid in one pool selects a different REAL entry in another, and a
  // real entry draws something. That is why this is per-glyph rather than a single fallback.
  localSubrsByGlyph: readonly (readonly CffIndexEntry[])[] | null;
}

// Why `createGlyphOutlineSourceFromOpenTypeFont` returned null, as plain data. The null sentinel covers
// situations whose remedies differ completely — a WOFF wants decompressing before it is offered, a
// CFF-outline font wants a charstring interpreter that does not exist yet, and a truncated table wants a
// repaired asset — and one sentinel cannot carry that. This is the pull-style answer; it holds no message
// strings, only the facts a caller would need to decide what to do next.
export interface OpenTypeFontExplanation {
  // True only when a source was produced. False for every reason except `ok`.
  accepted: boolean;
  reason: OpenTypeFontExplanationReason;
  // What the container turned out to be, as `detectFontFormat` names it, or '' when the bytes are too
  // short to tell. Carried even on success so a caller can log what it actually loaded.
  format: string;
  // The four-character tag this verdict is about: the missing table for `missing-required-table`, the
  // damaged one for `malformed-table`, the outline table found instead for `unsupported-outlines`.
  // Empty when the reason is not about one specific table.
  table: string;
  // How many tables the directory declares, and how many of those were readable within the byte range.
  // Both 0 when the directory itself could not be read. A gap between them localizes a truncated file
  // without needing the parser to say so in prose.
  tableCount: number;
  readableTableCount: number;
}

// `ok` — a source was produced.
// `too-short` — fewer bytes than the sfnt header and table directory need.
// `unsupported-container` — a font this package does not open: WOFF and WOFF2 are compressed wrappers
//   needing a decompression stage first, and a collection holds several fonts with no rule here for
//   which one is meant. Deliberately distinct from `unrecognized`: the bytes ARE a font.
// `unrecognized` — the leading bytes match no font container at all.
// `missing-required-table` — a table every outline source needs is absent; `table` names it.
// `unsupported-outlines` — the font is well-formed and carries outlines this package cannot yet read.
//   Today that means CFF/CFF2 PostScript charstrings, where `table` is `CFF ` or `CFF2`. This is a
//   stated boundary rather than a defect: the first cut reads quadratic `glyf` outlines only, and a
//   caller holding such a font needs a different producer rather than a repaired file.
// `malformed-table` — a required table is present but inconsistent with its own declared extent.
//   ★ THIS REASON CURRENTLY ABSORBS MORE THAN ITS NAME CLAIMS, AND THE SPLIT HAS NOT BEEN MADE. Every
//   sentinel return in `readOpenTypeFontTables` arrives here as this one answer, carrying an empty
//   `table` so it cannot even name which table — among them container unwrap, the table directory, the
//   glyph count, metrics, advances, the codepoint map, `loca` width and the outline table. THAT LIST IS
//   NOT CLOSED AND NO COUNT IS STATED ON PURPOSE: the set is defined by a producer in another package,
//   nothing here can recompute it, and a number typed in this comment would go stale the moment a
//   sentinel is added or resolved. Read the function; do not trust an enumeration written elsewhere.
//   The sentence above is FALSE for at least two of them: a well-formed `cmap` in a sub-table format
//   that producer has not implemented is not an inconsistency of extent, and neither is a WOFF whose
//   supplied decompressor declined. Those two want our code changed and a different decompress slot
//   respectively, while the sentence above sends a caller looking for a repaired asset.
//   Recorded here rather than fixed because choosing WHICH distinctions earn their own reason is a
//   design decision about this vocabulary, and a reason named badly outlives the session that coined
//   it — the causes do not each need a reason. Until that is decided, a caller should read this as
//   "this package could not build a source from these tables" and not as a claim about extents.
export type OpenTypeFontExplanationReason =
  | 'malformed-table'
  | 'missing-required-table'
  | 'ok'
  | 'too-short'
  | 'unrecognized'
  | 'unsupported-container'
  | 'unsupported-outlines';

// The sfnt container's table directory, read once and shared by every table parser. `tables` maps a
// four-character tag (`glyf`, `cmap`, `CFF ` — the trailing space is significant) to the table's byte
// range within the font.
//
// `declaredTableCount` is what the header CLAIMS, while `tables.size` is how many of those records were
// wholly inside the file. Keeping both is what lets a caller tell a font that simply lacks a table from
// one that was truncated mid-download, which are different problems with different remedies.
export interface SfntTableDirectory {
  declaredTableCount: number;
  // The container flavor: `0x00010000` for TrueType outlines, `0x4F54544F` (`OTTO`) for CFF outlines.
  sfntVersion: number;
  tables: ReadonlyMap<string, Readonly<SfntTableRange>>;
}

export interface SfntTableRange {
  length: number;
  offset: number;
}

// A table whose stored checksum disagrees with the one computed from its bytes.
//
// Reported rather than enforced, deliberately. A mismatch is BAD DATA, not API misuse, and deciding
// that a font is unacceptable is the caller's judgement — a reader that refused a font which would
// otherwise load would have taken a policy decision away from the consumer and given them no way to
// opt out. So the reader keeps loading and hands back what it saw; a caller who cares can act on it,
// and a caller who does not never pays for the check.
export interface WoffChecksumMismatch {
  // What the file's own directory claims for this table.
  stored: number;
  // What the table's bytes actually sum to, by the format's own algorithm.
  computed: number;
  tag: string;
}

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

// What a WOFF2 carries in place of sfnt's offset table.
//
// The shape differs from `SfntTableDirectory` in the way that matters to a reader: an sfnt directory
// gives every table an OFFSET, so tables can be read in any order and independently. A WOFF2 directory
// gives only LENGTHS, because every table lives in one Brotli stream end to end — so a table's position
// is the sum of the lengths before it, and nothing can be read until the whole stream is decompressed.
export interface Woff2TableDirectory {
  entries: readonly Woff2TableEntry[];
  // Where the compressed stream begins, which is only known once the variable-length directory has been
  // walked. Carried here so a caller never has to re-walk it, and never has to guess it from the end of
  // the file — the format's trailing padding makes that guess decode as a valid but empty stream.
  streamStart: number;
  // How many bytes the tables occupy once decompressed but before any transform is reversed. This is the
  // length the decompressor should produce, not the size of the sfnt that will be assembled from it.
  totalUncompressedLength: number;
}

export interface Woff2TableEntry {
  // The table's length as an sfnt table, after any transform has been reversed.
  originalLength: number;
  tag: string;
  // The table's length as it appears in the decompressed stream. Equal to `originalLength` when the
  // table was not transformed, so a caller can use it unconditionally to walk the stream.
  transformLength: number;
  // The raw two-bit version from the directory, kept because its MEANING depends on the tag: for `glyf`
  // and `loca` version 3 is the null transform, while for every other table version 0 is. `transformed`
  // carries that resolved answer so no caller has to reapply the rule.
  transformVersion: number;
  transformed: boolean;
}
