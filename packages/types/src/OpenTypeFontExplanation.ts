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
// `missing-decompressor` — the container is a WOFF, whose tables are DEFLATE-compressed, and no
//   decompressor is registered. Distinct from `unsupported-container` because the remedy is one line —
//   `registerDeflateDecompressor()` from `@flighthq/compression` — rather than a different producer. The
//   codec is not bundled here so that reading a plain `.ttf` never carries it.
// `malformed-table` — a required table is present but inconsistent with its own declared extent.
//   ★ THIS REASON CURRENTLY ABSORBS MORE THAN ITS NAME CLAIMS, AND THE SPLIT HAS NOT BEEN MADE. It is
//   the single answer reached by eight distinct causes — container unwrap, table directory, glyph
//   count, metrics, advances, codepoint map, `loca` width, and outline table — and it carries an empty
//   `table`, so it cannot name which one. The sentence above is FALSE for at least two of them: a
//   well-formed `cmap` in a sub-table format this package has not implemented is not an inconsistency
//   of extent, and neither is a WOFF whose registered decompressor declined. Those two want our code
//   changed and one line of registration respectively, while the sentence above sends a caller looking
//   for a repaired asset.
//   Recorded here rather than fixed because choosing WHICH distinctions earn their own reason is a
//   design decision about this vocabulary, and a reason named badly outlives the session that coined
//   it. Eight causes do not need eight reasons. Until that is decided, a caller should read this as
//   "this package could not build a source from these tables" and not as a claim about extents.
export type OpenTypeFontExplanationReason =
  | 'malformed-table'
  | 'missing-decompressor'
  | 'missing-required-table'
  | 'ok'
  | 'too-short'
  | 'unrecognized'
  | 'unsupported-container'
  | 'unsupported-outlines';
