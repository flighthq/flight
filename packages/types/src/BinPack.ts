// 2D rectangle bin-packing header. `@flighthq/binpack` takes a set of sized rectangles and places
// them without overlap into a bin, reporting each placement, the bin extent used, and anything that
// did not fit. It is the general geometry primitive underneath texture-atlas building, sprite-sheet
// layout, tileset assembly, and UI/grid packing — plain data in, plain data out, decoupled from all
// of them. Input is `{ id, width, height }`; output is placements `{ id, x, y, width, height,
// rotated }` plus the used bin size and the ids that overflowed.

// The caller-chosen identity of a rectangle, carried through from input to placement unchanged. A
// string or number so ids can be atlas region names, tile indices, or array positions.
export type RectangleId = string | number;

// One rectangle to pack: its caller `id` and its unrotated `width`/`height`. Sizes are in the same
// units as the bin; the packer never scales them.
export interface PackableRectangle {
  id: RectangleId;
  width: number;
  height: number;
}

// A placed rectangle in bin space. (`x`,`y`) is the top-left corner; `width`/`height` are the
// occupied extent as placed — swapped from the input when `rotated` is true (a 90° turn). The `id`
// matches the `PackableRectangle` it came from.
export interface PackedRectangle {
  id: RectangleId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

// Options for `packRectangles`. Every field is optional; the documented default applies when omitted.
export interface BinPackOptions {
  // Hard cap on the bin's width. A growable bin grows up to this; a fixed bin is exactly this.
  // Default: a large cap (16384) that effectively means "unbounded" for typical inputs.
  maxWidth?: number;
  // Hard cap on the bin's height. Default: a large cap (16384).
  maxHeight?: number;
  // Minimum gap kept between any two placed rectangles. Default: 0.
  padding?: number;
  // Minimum gap kept between every placed rectangle and the bin edge. Default: 0.
  border?: number;
  // When true, the reported `width`/`height` are each rounded up to the next power of two. Default:
  // false.
  powerOfTwo?: boolean;
  // When true, the reported `width` and `height` are forced equal (the larger of the two). Combined
  // with `powerOfTwo`, both stay equal after rounding. Default: false.
  square?: boolean;
  // When true, the packer may rotate a rectangle 90° if that orientation fits better; the placement
  // reports `rotated: true` and swapped `width`/`height`. Default: false.
  allowRotation?: boolean;
  // When true, the bin starts small and grows toward `maxWidth`/`maxHeight` to fit everything. When
  // false, the bin is fixed at `maxWidth`/`maxHeight` and rectangles that do not fit go to
  // `unpacked`. Default: true.
  growable?: boolean;
}

// The result of `packRectangles`. `placements` holds every rectangle that fit (deterministic order);
// `width`/`height` is the used bin extent after any power-of-two/square adjustment; `unpacked` lists
// the ids that did not fit (empty when everything was placed).
export interface PackResult {
  placements: PackedRectangle[];
  width: number;
  height: number;
  unpacked: RectangleId[];
}
