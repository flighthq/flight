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
  localSubrs: readonly CffIndexEntry[];
}
