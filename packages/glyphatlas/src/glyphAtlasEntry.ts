import { createSurfaceRegion, writeSurfacePixels } from '@flighthq/surface';
import type { GlyphAtlas, GlyphAtlasRuntime, GlyphEntry, GlyphRasterizedBitmap } from '@flighthq/types';

import { getGlyphRasterizerBackend } from './glyphRasterizerBackend';

// Returns the cached entry for `codepoint`, or ensures it first on a miss: rasterize via the active
// backend, pack the bitmap into the atlas (incremental shelf placement; on exhaustion, evict the
// least-recently-used glyphs and repack), blit its pixels into the atlas surface, record the dirty
// rect, and cache the entry. Returns null when the glyph cannot be produced — no rasterizer output,
// or a single glyph larger than the whole atlas. This is the dynamic `GlyphSource.getGlyphEntry`.
export function getGlyphAtlasEntry(atlas: Readonly<GlyphAtlas>, codepoint: number): GlyphEntry | null {
  const runtime = atlas.runtime;
  const existing = runtime.entries.get(codepoint);
  if (existing !== undefined) {
    _touchGlyphLru(runtime, codepoint);
    return existing;
  }

  const bitmap = getGlyphRasterizerBackend().rasterize(codepoint, runtime.rasterizeOptions);
  if (bitmap === null) return null;

  // A glyph larger than the usable atlas area can never be placed, however much is evicted.
  const padding = runtime.padding;
  const usableWidth = runtime.surface.width - 2 * padding;
  const usableHeight = runtime.surface.height - 2 * padding;
  if (bitmap.width > usableWidth || bitmap.height > usableHeight) return null;

  // Evicting for the glyph-count budget frees logical cache slots; the freed atlas space is reclaimed
  // lazily by the first repack that placement forces below.
  let needsRepack = false;
  while (runtime.maxGlyphs > 0 && runtime.entries.size >= runtime.maxGlyphs) {
    if (!_evictLeastRecentlyUsedGlyph(runtime)) break;
    needsRepack = true;
  }

  let placement = _placeGlyphOnShelf(runtime, bitmap.width, bitmap.height);
  if (placement === null && needsRepack) {
    _repackGlyphAtlas(runtime);
    placement = _placeGlyphOnShelf(runtime, bitmap.width, bitmap.height);
  }
  while (placement === null) {
    // The usable-bounds check above guarantees the glyph fits in an empty atlas, so this sentinel is
    // defensive: an empty cache that still cannot place means the glyph exceeds the atlas.
    if (runtime.entries.size === 0) return null;
    _evictLeastRecentlyUsedGlyph(runtime);
    _repackGlyphAtlas(runtime);
    placement = _placeGlyphOnShelf(runtime, bitmap.width, bitmap.height);
  }

  const entry: GlyphEntry = {
    advance: bitmap.advance,
    bearingX: bitmap.bearingX,
    bearingY: bitmap.bearingY,
    height: bitmap.height,
    page: 0, // The dynamic atlas is one growing surface — a single page.
    width: bitmap.width,
    x: placement.x,
    y: placement.y,
  };
  runtime.entries.set(codepoint, entry);
  runtime.bitmaps.set(codepoint, bitmap);
  runtime.lru.push(codepoint);
  _blitGlyphIntoAtlasSurface(runtime, entry, bitmap);
  return entry;
}

// Writes the glyph's RGBA pixels into the atlas surface at the entry's rect and unions that rect into
// the dirty region for incremental upload.
function _blitGlyphIntoAtlasSurface(
  runtime: GlyphAtlasRuntime,
  entry: Readonly<GlyphEntry>,
  bitmap: Readonly<GlyphRasterizedBitmap>,
): void {
  const region = createSurfaceRegion(runtime.surface, entry.x, entry.y, entry.width, entry.height);
  writeSurfacePixels(region, bitmap.pixels);
  _markGlyphAtlasDirtyRect(runtime, entry.x, entry.y, entry.width, entry.height);
}

// Evicts the least-recently-used glyph (front of the LRU list), removing its entry and retained
// bitmap. Its atlas space is not reclaimed until the next repack. Returns false when nothing is
// cached.
function _evictLeastRecentlyUsedGlyph(runtime: GlyphAtlasRuntime): boolean {
  const codepoint = runtime.lru.shift();
  if (codepoint === undefined) return false;
  runtime.entries.delete(codepoint);
  runtime.bitmaps.delete(codepoint);
  return true;
}

// Unions the rectangle (`x`,`y`,`width`,`height`) into the atlas's dirty region, starting a fresh
// region when none is pending.
function _markGlyphAtlasDirtyRect(
  runtime: GlyphAtlasRuntime,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const maxX = x + width;
  const maxY = y + height;
  if (!runtime.dirty) {
    runtime.dirty = true;
    runtime.dirtyMinX = x;
    runtime.dirtyMinY = y;
    runtime.dirtyMaxX = maxX;
    runtime.dirtyMaxY = maxY;
    return;
  }
  runtime.dirtyMinX = Math.min(runtime.dirtyMinX, x);
  runtime.dirtyMinY = Math.min(runtime.dirtyMinY, y);
  runtime.dirtyMaxX = Math.max(runtime.dirtyMaxX, maxX);
  runtime.dirtyMaxY = Math.max(runtime.dirtyMaxY, maxY);
}

// Incrementally places a `width x height` glyph with the shelf packer: it reuses the shortest shelf
// tall enough with horizontal room (best-height-fit), else opens a new shelf at the current bottom.
// Padding is honored as a gutter to the left/right of each glyph and from the atlas edges. Returns
// the top-left placement, or null when neither an existing shelf nor a new one has room.
function _placeGlyphOnShelf(
  runtime: GlyphAtlasRuntime,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const padding = runtime.padding;
  const surface = runtime.surface;
  const rightLimit = surface.width - padding;

  let best: GlyphAtlasRuntime['shelves'][number] | null = null;
  let bestSlack = Number.POSITIVE_INFINITY;
  for (const shelf of runtime.shelves) {
    if (shelf.height < height) continue;
    if (shelf.cursorX + width > rightLimit) continue;
    const slack = shelf.height - height;
    if (slack < bestSlack) {
      best = shelf;
      bestSlack = slack;
    }
  }
  if (best !== null) {
    const x = best.cursorX;
    best.cursorX = x + width + padding;
    return { x, y: best.y };
  }

  const y = runtime.packBottom;
  if (y + height > surface.height - padding) return null;
  if (padding + width > rightLimit) return null;
  runtime.shelves.push({ cursorX: padding + width + padding, height, y });
  runtime.packBottom = y + height + padding;
  return { x: padding, y };
}

// Rebuilds the atlas from its surviving cached glyphs to reclaim the space freed by eviction: it
// clears the surface and shelf state, re-places every survivor (tallest first, for tight shelf
// packing), re-blits its pixels, and updates its entry's position in place. A survivor that no
// longer fits is dropped. The whole atlas is marked dirty since glyphs have moved.
function _repackGlyphAtlas(runtime: GlyphAtlasRuntime): void {
  runtime.shelves.length = 0;
  runtime.packBottom = runtime.padding;
  runtime.surface.data.fill(0);

  const codepoints = [...runtime.entries.keys()].sort((a, b) => {
    const heightDelta = runtime.entries.get(b)!.height - runtime.entries.get(a)!.height;
    return heightDelta !== 0 ? heightDelta : a - b;
  });
  for (const codepoint of codepoints) {
    const entry = runtime.entries.get(codepoint)!;
    const bitmap = runtime.bitmaps.get(codepoint)!;
    const placement = _placeGlyphOnShelf(runtime, bitmap.width, bitmap.height);
    if (placement === null) {
      runtime.entries.delete(codepoint);
      runtime.bitmaps.delete(codepoint);
      const lruIndex = runtime.lru.indexOf(codepoint);
      if (lruIndex !== -1) runtime.lru.splice(lruIndex, 1);
      continue;
    }
    entry.x = placement.x;
    entry.y = placement.y;
    const region = createSurfaceRegion(runtime.surface, entry.x, entry.y, entry.width, entry.height);
    writeSurfacePixels(region, bitmap.pixels);
  }
  _markGlyphAtlasDirtyRect(runtime, 0, 0, runtime.surface.width, runtime.surface.height);
}

// Moves `codepoint` to the most-recently-used end of the LRU list so eviction takes the oldest first.
function _touchGlyphLru(runtime: GlyphAtlasRuntime, codepoint: number): void {
  const index = runtime.lru.indexOf(codepoint);
  if (index !== -1) runtime.lru.splice(index, 1);
  runtime.lru.push(codepoint);
}
