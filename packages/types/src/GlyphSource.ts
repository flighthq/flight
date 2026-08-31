import type { Bitmap } from './Bitmap';
import type { TextureSource } from './TextureSource';

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
  getGlyphAtlasImage(page?: number): TextureSource | null;
  // Returns the glyph's atlas region + metrics, ensuring it is rasterized and cached first. Returns
  // null when the glyph cannot be produced (no rasterizer, or a glyph larger than the whole atlas).
  getGlyphEntry(codepoint: number): GlyphEntry | null;
  // The horizontal kerning adjustment between an adjacent left/right glyph pair, in pixels. 0 when
  // the source carries no kerning.
  getGlyphKerning(left: number, right: number): number;
  // The revision of the source's glyph PLACEMENT — the atlas rects `getGlyphEntry` hands out. It is
  // bumped whenever a rect previously returned stops describing that glyph's pixels, which for a
  // dynamic atlas is every repack: eviction frees logical slots, and the repack that reclaims them
  // moves the survivors and re-uses the dropped glyphs' space. A consumer that BAKES rects — a
  // BitmapText's per-page `TextureAtlas` regions — samples the wrong pixels from that moment on, and
  // nothing about the atlas image or the entry object changes to reveal it: the rect is still a valid
  // rect, now over another glyph. Stamping this number alongside the baked rects and comparing it
  // later is how that consumer learns to re-bake (`refreshBitmapTextGlyphLayout`).
  //
  // This is the tier-2 versioned-payload shape from the invalidation doctrine, and it is versioned
  // rather than compared because of fan-out: one atlas backs every BitmapText bound to it, and no
  // caller has to enumerate them. A static source (a pre-baked bitmap font) never relocates a glyph,
  // so it returns a constant.
  getGlyphLayoutVersion(): number;
  // The source's shared line metrics (ascent/descent/lineGap).
  getGlyphMetrics(): Readonly<GlyphMetrics>;
}

// One cached glyph: its rectangle within the atlas bitmap (pixels) plus the pen advance and the
// bearing offset from the pen origin to the glyph box's top-left. UVs are not stored — a renderer
// derives them from `x`/`y`/`width`/`height` divided by the atlas bitmap size, so the entry stays
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
// atlas bitmap, and records a `GlyphEntry`.
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
  // Font-level line metrics, when the backend can measure them. Optional so existing backends stay
  // valid: an atlas whose backend does not implement it, or which returns null, keeps the font-size
  // heuristic from deriveGlyphMetricsFromFontSize. Measured once per atlas rather than per glyph,
  // because these describe the font at a size, not any particular character.
  measureMetrics?(options: Readonly<GlyphRasterizeOptions>): GlyphMetrics | null;
}

// Construction options for a dynamic glyph atlas. `width`/`height` size the atlas bitmap; the font
// identity + size drive rasterization; `padding` is the gutter between packed glyphs and from the
// atlas edges (default 1); `maxGlyphs` caps the live cache (0 = only the atlas area bounds it).
export interface GlyphAtlasOptions {
  fontFamily: string;
  fontSize: number;
  // Style and weight are per-atlas, not per-glyph: the cache is keyed by codepoint alone, so one atlas
  // holds one rendering of each character. Bold or italic text needs its own atlas rather than a flag
  // at draw time — one atlas per (family, size, style, weight) combination the app actually uses.
  // Backend-interpreted strings, forwarded verbatim to the rasterizer.
  fontStyle?: string;
  fontWeight?: string;
  height: number;
  // Budgets on what the cache RETAINS, which is what actually bounds memory. `maxBytes` caps the
  // retained source bitmaps (the atlas keeps each glyph's pixels to re-blit on repack, so they are the
  // dominant cost and they scale with font size, not glyph count). `maxArea` caps the atlas area those
  // glyphs occupy. `maxGlyphs` is kept as a secondary count cap for callers who think in glyphs.
  // 0 or absent means unbounded on that axis; the atlas area always bounds the cache regardless.
  maxArea?: number;
  maxBytes?: number;
  maxGlyphs?: number;
  padding?: number;
  // Overrides the process-wide rasterizer for this atlas. This is the composition lane for embedded
  // or parsed fonts: each atlas can bind its own outline-backed rasterizer without changing how any
  // other atlas resolves glyphs.
  rasterizerBackend?: GlyphRasterizerBackend;
  width: number;
}

// One row of the incremental shelf packer: glyphs of similar height share a horizontal band. Part
// of the opaque runtime — a text renderer never reads it.
export interface GlyphAtlasShelf {
  cursorX: number;
  height: number;
  y: number;
}

// Opaque per-atlas runtime holding all package-private state: the atlas bitmap the glyphs blit
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
  // Codepoints in least-recently-used order. A Map rather than an array because recency is maintained
  // on every cache hit: `delete` then `set` moves a key to the end in O(1), where an array had to scan
  // itself with indexOf first — a per-glyph cost on the text-rendering hot path that grew with the
  // cache. Iteration order is insertion order, so the first key is the eviction candidate. The value
  // carries nothing; only key order matters.
  lru: Map<number, true>;
  // Bumped by every event that invalidates a rect this atlas already handed out: a repack (which
  // relocates survivors, drops the ones that no longer fit, and re-uses the freed space) and a
  // dispose (which resets the packer over pixels it does not clear). Read through
  // `getGlyphAtlasLayoutVersion` and the `GlyphSource.getGlyphLayoutVersion` seam. It is NOT bumped by
  // eviction alone: shelf cursors only advance, so an evicted glyph's pixels stay untouched — and
  // therefore still correct to draw — until a repack reclaims them.
  layoutVersion: number;
  maxArea: number;
  maxBytes: number;
  maxGlyphs: number;
  // Running totals for the budgets above, maintained wherever the cache changes rather than recomputed:
  // every insert, eviction, repack drop, and reset moves them, so a walk is never needed to answer
  // "is this over budget".
  occupiedArea: number;
  retainedBytes: number;
  metrics: GlyphMetrics;
  packBottom: number;
  padding: number;
  rasterizerBackend: GlyphRasterizerBackend;
  rasterizeOptions: GlyphRasterizeOptions;
  shelves: GlyphAtlasShelf[];
  bitmap: Bitmap;
}

// A dynamic glyph atlas entity. It carries no public data of its own — the bitmap, cache, and
// packer live inside the opaque runtime. Create it with `createGlyphAtlas`, drive it with
// `getGlyphAtlasEntry` (rasterize-on-miss), read its pixels with `getGlyphAtlasBitmap`, and hand it
// to a renderer as a `GlyphSource` via `createGlyphSourceFromGlyphAtlas`.
export interface GlyphAtlas {
  runtime: GlyphAtlasRuntime;
}

// Every operation name on the backend, DERIVED from the interface rather than listed. A hand-written
// roster would be a second source of truth that drifts the moment an operation is added or renamed;
// `keyof` cannot.
export type GlyphRasterizerOperation = keyof GlyphRasterizerBackend;
