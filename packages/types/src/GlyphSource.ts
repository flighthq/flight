import type { ImageResource } from './ImageResource';
import type { Surface } from './Surface';

// The shared seam a text renderer consumes to draw glyphs, independent of how those glyphs are
// produced. `@flighthq/glyphatlas` implements it dynamically (rasterize-on-miss into a growing
// atlas); the planned `@flighthq/bitmapfont` implements it statically (a pre-baked atlas). A
// renderer holds a `GlyphSource` and asks it for a glyph's atlas region + metrics without knowing
// which implementation is behind it. The seam yields both the glyph geometry (`getGlyphEntry`) AND
// the backing atlas image its rects sample (`getGlyphAtlasImage`), so a renderer needs nothing else:
// it draws each glyph's rect from the same-page image, one page at a time.
//
// It is a small method object (not free functions) precisely because it is the runtime-swappable
// boundary between the renderer and either implementation — the one place in the SDK where a bound
// handle is the right shape. Adapt a `GlyphAtlas` into one with `createGlyphSourceFromGlyphAtlas`.
export interface GlyphSource {
  // The atlas image a same-page `getGlyphEntry` rect samples from — the pixels paired with the
  // geometry seam. `page` selects which atlas image (default 0); returns null when the page does not
  // exist. Single-page sources hold everything on page 0 and return null for any other page.
  getGlyphAtlasImage(page?: number): ImageResource | null;
  // Returns the glyph's atlas region + metrics, ensuring it is rasterized and cached first. Returns
  // null when the glyph cannot be produced (no rasterizer, or a glyph larger than the whole atlas).
  getGlyphEntry(codepoint: number): GlyphEntry | null;
  // The horizontal kerning adjustment between an adjacent left/right glyph pair, in pixels. 0 when
  // the source carries no kerning.
  getGlyphKerning(left: number, right: number): number;
  // The source's shared line metrics (ascent/descent/lineGap).
  getGlyphMetrics(): Readonly<GlyphMetrics>;
}

// One cached glyph: its rectangle within the atlas surface (pixels) plus the pen advance and the
// bearing offset from the pen origin to the glyph box's top-left. UVs are not stored — a renderer
// derives them from `x`/`y`/`width`/`height` divided by the atlas surface size, so the entry stays
// resolution-independent of any particular GPU texture.
export interface GlyphEntry {
  advance: number;
  bearingX: number;
  bearingY: number;
  height: number;
  // Which atlas page/image this glyph's rect samples from — the index passed to
  // `getGlyphAtlasImage`. 0 for single-page sources (a single-page atlas or a single-page font).
  page: number;
  width: number;
  x: number;
  y: number;
}

// Shared vertical line metrics for a glyph source, in pixels at the source's size. `ascent` and
// `descent` are both positive distances from the baseline; `lineGap` is the extra leading between
// lines. The single line advance is `ascent + descent + lineGap`.
export interface GlyphMetrics {
  ascent: number;
  descent: number;
  lineGap: number;
}

// A rasterizer's output for one glyph: an RGBA (row-major, straight-alpha) pixel block plus the pen
// advance and bearing. `pixels` is exactly `width * height * 4` bytes. This is the plain-data
// hand-off from a `GlyphRasterizerBackend` to the atlas, which packs it, blits `pixels` into the
// atlas surface, and records a `GlyphEntry`.
export interface GlyphRasterizedBitmap {
  advance: number;
  bearingX: number;
  bearingY: number;
  height: number;
  pixels: Uint8ClampedArray;
  width: number;
}

// The knobs a rasterizer needs to render a glyph. Held per-atlas (from `GlyphAtlasOptions`) and
// passed on every `rasterize` call. Weight/style are optional and backend-interpreted.
export interface GlyphRasterizeOptions {
  fontFamily: string;
  fontSize: number;
  fontStyle?: string;
  fontWeight?: number | string;
}

// The swappable glyph-rasterization seam. The web backend renders via an offscreen canvas; a native
// host supplies a FreeType-style backend via `setGlyphRasterizerBackend`. `rasterize` returns null
// for an unrenderable codepoint (or when no canvas is available), never throwing.
export interface GlyphRasterizerBackend {
  rasterize(codepoint: number, options: Readonly<GlyphRasterizeOptions>): GlyphRasterizedBitmap | null;
}

// Construction options for a dynamic glyph atlas. `width`/`height` size the atlas surface; the font
// identity + size drive rasterization; `padding` is the gutter between packed glyphs and from the
// atlas edges (default 1); `maxGlyphs` caps the live cache (0 = only the atlas area bounds it).
export interface GlyphAtlasOptions {
  fontFamily: string;
  fontSize: number;
  height: number;
  maxGlyphs?: number;
  padding?: number;
  width: number;
}

// One row of the incremental shelf packer: glyphs of similar height share a horizontal band. Part
// of the opaque runtime — a text renderer never reads it.
export interface GlyphAtlasShelf {
  cursorX: number;
  height: number;
  y: number;
}

// Opaque per-atlas runtime holding all package-private state: the atlas surface the glyphs blit
// into, the incremental shelf-packer state, the codepoint→entry cache with its LRU order, the
// retained source bitmaps used to re-blit on repack, the union dirty rectangle for incremental GPU
// upload, and the metrics + rasterize options. Application and renderer code treat this as internal.
export interface GlyphAtlasRuntime {
  bitmaps: Map<number, GlyphRasterizedBitmap>;
  dirty: boolean;
  dirtyMaxX: number;
  dirtyMaxY: number;
  dirtyMinX: number;
  dirtyMinY: number;
  entries: Map<number, GlyphEntry>;
  lru: number[];
  maxGlyphs: number;
  metrics: GlyphMetrics;
  packBottom: number;
  padding: number;
  rasterizeOptions: GlyphRasterizeOptions;
  shelves: GlyphAtlasShelf[];
  surface: Surface;
}

// A dynamic glyph atlas entity. It carries no public data of its own — the surface, cache, and
// packer live inside the opaque runtime. Create it with `createGlyphAtlas`, drive it with
// `getGlyphAtlasEntry` (rasterize-on-miss), read its pixels with `getGlyphAtlasSurface`, and hand it
// to a renderer as a `GlyphSource` via `createGlyphSourceFromGlyphAtlas`.
export interface GlyphAtlas {
  runtime: GlyphAtlasRuntime;
}
