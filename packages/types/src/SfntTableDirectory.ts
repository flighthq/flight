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
