import { createBitmap } from '@flighthq/bitmap/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Bitmap,
  EntityConstruction,
  GlyphAtlas,
  GlyphAtlasOptions,
  GlyphMetrics,
  GlyphRasterizeOptions,
  GlyphRasterizerBackend,
} from '@flighthq/types/contract';

export function createGlyphAtlas(options: Readonly<GlyphAtlasOptions>): GlyphAtlas {
  const padding = options.padding ?? 1;
  const rasterizerBackend = options.rasterizerBackend;
  // Built before the runtime so the metrics probe sees the same font the glyphs will rasterize with.
  const rasterizeOptions: GlyphRasterizeOptions = {
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    ...(options.fontStyle !== undefined ? { fontStyle: options.fontStyle } : {}),
    ...(options.fontWeight !== undefined ? { fontWeight: options.fontWeight } : {}),
  };
  const out = allocateEntity<GlyphAtlas>();
  out.runtime = {
    bitmaps: new Map(),
    dirty: false,
    dirtyMaxX: 0,
    dirtyMaxY: 0,
    dirtyMinX: 0,
    dirtyMinY: 0,
    entries: new Map(),
    layoutVersion: 0,
    lru: new Map(),
    maxArea: options.maxArea ?? 0,
    maxBytes: options.maxBytes ?? 0,
    maxGlyphs: options.maxGlyphs ?? 0,
    occupiedArea: 0,
    retainedBytes: 0,
    metrics: _resolveGlyphAtlasMetrics(rasterizerBackend, rasterizeOptions),
    packBottom: padding,
    padding,
    rasterizerBackend,
    rasterizeOptions,
    shelves: [],
    bitmap: createBitmap(options.width, options.height),
  };
  return finishEntity(out);
}

// Estimates line metrics from a pixel font size when a real font-metrics source is not wired up. The
// 0.8/0.2 ascent/descent split and zero line gap are a coarse Latin-typical default; a text
// renderer that needs true metrics should read them from the shaping layer once that seam exists.
export function deriveGlyphMetricsFromFontSize(fontSize: number): GlyphMetrics {
  return {
    ascent: fontSize * 0.8,
    descent: fontSize * 0.2,
    lineGap: 0,
  };
}

// Drops the cache, the retained source bitmaps, the LRU order, and the packer so the atlas becomes
// an empty, inert shell and its sizable retained memory (the per-glyph bitmap copies) becomes
// GC-eligible. The bitmap holds only CPU-managed pixel data (no GPU/native handle) and is released
// to GC when the atlas is dropped, so this is `dispose*`, not `destroy*`; a renderer that uploaded
// the bitmap to a GPU texture frees that texture through its own render state.
export function disposeGlyphAtlas(atlas: GlyphAtlas): void {
  const runtime = atlas.runtime;
  runtime.entries.clear();
  runtime.bitmaps.clear();
  runtime.occupiedArea = 0;
  runtime.retainedBytes = 0;
  runtime.lru.clear();
  runtime.shelves.length = 0;
  runtime.packBottom = runtime.padding;
  runtime.dirty = false;
  // The packer restarts at the top over pixels this does not clear, so every rect handed out before
  // now describes space the next glyph may claim.
  runtime.layoutVersion++;
}

// The atlas's backing bitmap — the pixels a renderer uploads to a GPU texture. Use
// `getGlyphAtlasDirtyRegion` to upload only the changed sub-rect.
export function getGlyphAtlasBitmap(atlas: Readonly<GlyphAtlas>): Bitmap {
  return atlas.runtime.bitmap;
}

// The revision of this atlas's glyph placement — the `GlyphSource.getGlyphLayoutVersion` seam for a
// dynamic atlas. It changes when a repack relocates or drops cached glyphs, or a dispose resets the
// packer; a consumer that baked `GlyphEntry` rects re-reads them when it changes. Distinct from the
// dirty region, which reports which PIXELS to re-upload: an atlas can be dirty with every rect still
// valid (a glyph appended into free space), and after a repack it is both.
export function getGlyphAtlasLayoutVersion(atlas: Readonly<GlyphAtlas>): number {
  return atlas.runtime.layoutVersion;
}

// Asks this atlas's bound backend to measure the font, falling back to the size heuristic when it
// cannot. Metrics are resolved once at construction rather than per query: they describe the font at
// a size, which does not change over the atlas's life, and a backend measurement can touch a canvas.
function _resolveGlyphAtlasMetrics(
  backend: Readonly<GlyphRasterizerBackend>,
  rasterizeOptions: Readonly<GlyphRasterizeOptions>,
): GlyphMetrics {
  const measured = backend.measureMetrics?.(rasterizeOptions) ?? null;
  return measured ?? deriveGlyphMetricsFromFontSize(rasterizeOptions.fontSize);
}
