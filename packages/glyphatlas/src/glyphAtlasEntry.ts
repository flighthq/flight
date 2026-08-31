import { createBitmapRegion, writeBitmapPixels } from '@flighthq/bitmap/contract';
import type { GlyphAtlas, GlyphAtlasRuntime, GlyphEntry, GlyphRasterizedBitmap } from '@flighthq/types/contract';

// Returns the cached entry for `codepoint`, or ensures it first on a miss: rasterize via the atlas's
// bound backend, pack the bitmap into the atlas (incremental shelf placement; on exhaustion, evict the
// least-recently-used glyphs and repack), blit its pixels into the atlas bitmap, record the dirty
// rect, and cache the entry. Returns null when the glyph cannot be produced — no rasterizer output,
// or a single glyph larger than the whole atlas. This is the dynamic `GlyphSource.getGlyphEntry`.
export function getGlyphAtlasEntry(atlas: Readonly<GlyphAtlas>, codepoint: number): GlyphEntry | null {
  const runtime = atlas.runtime;
  const existing = runtime.entries.get(codepoint);
  if (existing !== undefined) {
    _touchGlyphLru(runtime, codepoint);
    return existing;
  }

  const bitmap = runtime.rasterizerBackend.rasterize(codepoint, runtime.rasterizeOptions);
  if (bitmap === null) {
    _entryGuard?.('rasterizer-returned-null', codepoint);
    return null;
  }

  // A glyph larger than the usable atlas area can never be placed, however much is evicted.
  const padding = runtime.padding;
  const usableWidth = runtime.bitmap.width - 2 * padding;
  const usableHeight = runtime.bitmap.height - 2 * padding;
  if (bitmap.width > usableWidth || bitmap.height > usableHeight) {
    _entryGuard?.('glyph-larger-than-atlas', codepoint);
    return null;
  }

  // Evicting for the glyph-count budget frees logical cache slots; the freed atlas space is reclaimed
  // lazily by the first repack that placement forces below.
  let needsRepack = false;
  // Evict until the incoming glyph fits every budget, not just the glyph count. Bytes are the budget
  // that actually bounds memory: the atlas retains each source bitmap to re-blit on repack, so a cache
  // of large glyphs costs far more than the same count of small ones, and a count cap cannot express
  // that. The incoming glyph's own cost is included so the budget holds AFTER the insert.
  const incomingBytes = bitmap.pixels.byteLength;
  const incomingArea = bitmap.width * bitmap.height;
  while (_isGlyphAtlasOverBudget(runtime, incomingBytes, incomingArea)) {
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
    page: 0, // The dynamic atlas is one growing bitmap — a single page.
    width: bitmap.width,
    x: placement.x,
    y: placement.y,
  };
  runtime.entries.set(codepoint, entry);
  runtime.bitmaps.set(codepoint, bitmap);
  runtime.retainedBytes += incomingBytes;
  runtime.occupiedArea += incomingArea;
  runtime.lru.set(codepoint, true);
  _blitGlyphIntoAtlasBitmap(runtime, entry, bitmap);
  return entry;
}

// Writes the glyph's RGBA pixels into the atlas bitmap at the entry's rect and unions that rect into
// the dirty region for incremental upload.
function _blitGlyphIntoAtlasBitmap(
  runtime: GlyphAtlasRuntime,
  entry: Readonly<GlyphEntry>,
  bitmap: Readonly<GlyphRasterizedBitmap>,
): void {
  const region = createBitmapRegion(runtime.bitmap, entry.x, entry.y, entry.width, entry.height);
  writeBitmapPixels(region, bitmap.pixels);
  _markGlyphAtlasDirtyRect(runtime, entry.x, entry.y, entry.width, entry.height);
}

// Evicts the least-recently-used glyph (front of the LRU list), removing its entry and retained
// bitmap. Its atlas space is not reclaimed until the next repack. Returns false when nothing is
// cached.
function _evictLeastRecentlyUsedGlyph(runtime: GlyphAtlasRuntime): boolean {
  // Insertion order makes the first key the least recently used, since every touch re-inserts.
  const oldest = runtime.lru.keys().next();
  if (oldest.done === true) return false;
  const codepoint = oldest.value;
  runtime.lru.delete(codepoint);
  _releaseGlyphBudget(runtime, codepoint);
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
  const bitmap = runtime.bitmap;
  const rightLimit = bitmap.width - padding;

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
  if (y + height > bitmap.height - padding) return null;
  if (padding + width > rightLimit) return null;
  runtime.shelves.push({ cursorX: padding + width + padding, height, y });
  runtime.packBottom = y + height + padding;
  return { x: padding, y };
}

// Rebuilds the atlas from its surviving cached glyphs to reclaim the space freed by eviction: it
// clears the bitmap and shelf state, re-places every survivor (tallest first, for tight shelf
// packing), re-blits its pixels, and updates its entry's position in place. A survivor that no
// longer fits is dropped. The whole atlas is marked dirty since glyphs have moved.
function _repackGlyphAtlas(runtime: GlyphAtlasRuntime): void {
  // Bumped first, and unconditionally: from here on every rect this atlas handed out is suspect, and
  // that is true whether a survivor moved, a survivor happened to land back on its old coordinates, or
  // a dropped glyph's space was handed to another glyph. The version is the one signal a consumer that
  // baked rects can compare — the entry objects themselves are mutated in place and reveal nothing.
  runtime.layoutVersion++;
  _entryGuard?.('repack', runtime.entries.size);
  runtime.shelves.length = 0;
  runtime.packBottom = runtime.padding;
  runtime.bitmap.data.fill(0);

  const codepoints = [...runtime.entries.keys()].sort((a, b) => {
    const heightDelta = runtime.entries.get(b)!.height - runtime.entries.get(a)!.height;
    return heightDelta !== 0 ? heightDelta : a - b;
  });
  for (const codepoint of codepoints) {
    const entry = runtime.entries.get(codepoint)!;
    const bitmap = runtime.bitmaps.get(codepoint)!;
    const placement = _placeGlyphOnShelf(runtime, bitmap.width, bitmap.height);
    if (placement === null) {
      _entryGuard?.('repack-dropped', codepoint);
      _releaseGlyphBudget(runtime, codepoint);
      runtime.entries.delete(codepoint);
      runtime.bitmaps.delete(codepoint);
      runtime.lru.delete(codepoint);
      continue;
    }
    entry.x = placement.x;
    entry.y = placement.y;
    const region = createBitmapRegion(runtime.bitmap, entry.x, entry.y, entry.width, entry.height);
    writeBitmapPixels(region, bitmap.pixels);
  }
  _markGlyphAtlasDirtyRect(runtime, 0, 0, runtime.bitmap.width, runtime.bitmap.height);
}

// Moves `codepoint` to the most-recently-used end of the LRU list so eviction takes the oldest first.
function _touchGlyphLru(runtime: GlyphAtlasRuntime, codepoint: number): void {
  // Delete before set: re-setting an existing key keeps its original position, so the delete is what
  // actually moves the codepoint to the most-recently-used end.
  runtime.lru.delete(codepoint);
  runtime.lru.set(codepoint, true);
}

// True when adding a glyph of `incomingBytes`/`incomingArea` would exceed a budget that is set. A
// budget of 0 means unbounded on that axis. Requires a non-empty cache to be over budget, so a single
// glyph larger than the whole budget is still admitted rather than evicting forever against itself —
// the usable-bounds check upstream is what rejects a glyph too large for the atlas.
function _isGlyphAtlasOverBudget(runtime: GlyphAtlasRuntime, incomingBytes: number, incomingArea: number): boolean {
  if (runtime.entries.size === 0) return false;
  if (runtime.maxGlyphs > 0 && runtime.entries.size >= runtime.maxGlyphs) return true;
  if (runtime.maxBytes > 0 && runtime.retainedBytes + incomingBytes > runtime.maxBytes) return true;
  if (runtime.maxArea > 0 && runtime.occupiedArea + incomingArea > runtime.maxArea) return true;
  return false;
}

// Subtracts a glyph's cost from the running totals. Called before the maps are mutated, since it reads
// the bitmap it is about to remove — every path that drops a glyph goes through here so the totals
// cannot drift from the cache they describe.
function _releaseGlyphBudget(runtime: GlyphAtlasRuntime, codepoint: number): void {
  const bitmap = runtime.bitmaps.get(codepoint);
  if (bitmap === undefined) return;
  runtime.retainedBytes -= bitmap.pixels.byteLength;
  runtime.occupiedArea -= bitmap.width * bitmap.height;
}

/** Installs the glyph-atlas guard, or clears it with `null`. The seam exists so the messages and the
 *  `@flighthq/log` dependency live in the separately-importable guard module rather than on this hot
 *  path; not importing that module costs production nothing. Called by `enableGlyphAtlasGuards`.
 *
 *  `subject` is the codepoint for the glyph-scoped reasons and the surviving glyph count for `repack`,
 *  which is not about one glyph. The seam carries the number and never the noun: which one it is
 *  follows from `reason`, and naming it is the guard module's job along with the wording. */
export function setGlyphAtlasEntryGuard(guard: ((reason: string, subject: number) => void) | null): void {
  _entryGuard = guard;
}

let _entryGuard: ((reason: string, subject: number) => void) | null = null;
