import { createSurface } from '@flighthq/surface';
import type { GlyphAtlas, GlyphAtlasOptions, GlyphMetrics, Surface } from '@flighthq/types';

// Allocates a dynamic glyph atlas: an empty `width x height` atlas surface, an empty codepoint→entry
// cache, and a fresh incremental shelf packer. Glyphs are added lazily by `getGlyphAtlasEntry`;
// nothing is rasterized here. `padding` defaults to 1px of gutter between glyphs and from the edges;
// `maxGlyphs` (default 0 = unbounded, only the atlas area caps it) bounds the live cache for LRU
// eviction. Line metrics are derived from `fontSize` for now (see `deriveGlyphMetricsFromFontSize`).
export function createGlyphAtlas(options: Readonly<GlyphAtlasOptions>): GlyphAtlas {
  const padding = options.padding ?? 1;
  return {
    runtime: {
      bitmaps: new Map(),
      dirty: false,
      dirtyMaxX: 0,
      dirtyMaxY: 0,
      dirtyMinX: 0,
      dirtyMinY: 0,
      entries: new Map(),
      lru: [],
      maxGlyphs: options.maxGlyphs ?? 0,
      metrics: deriveGlyphMetricsFromFontSize(options.fontSize),
      packBottom: padding,
      padding,
      rasterizeOptions: {
        fontFamily: options.fontFamily,
        fontSize: options.fontSize,
      },
      shelves: [],
      surface: createSurface(options.width, options.height),
    },
  };
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
// GC-eligible. The surface holds only CPU-managed pixel data (no GPU/native handle) and is released
// to GC when the atlas is dropped, so this is `dispose*`, not `destroy*`; a renderer that uploaded
// the surface to a GPU texture frees that texture through its own render state.
export function disposeGlyphAtlas(atlas: GlyphAtlas): void {
  const runtime = atlas.runtime;
  runtime.entries.clear();
  runtime.bitmaps.clear();
  runtime.lru.length = 0;
  runtime.shelves.length = 0;
  runtime.packBottom = runtime.padding;
  runtime.dirty = false;
}

// The atlas's backing surface — the pixels a renderer uploads to a GPU texture. Use
// `getGlyphAtlasDirtyRegion` to upload only the changed sub-rect.
export function getGlyphAtlasSurface(atlas: Readonly<GlyphAtlas>): Surface {
  return atlas.runtime.surface;
}
