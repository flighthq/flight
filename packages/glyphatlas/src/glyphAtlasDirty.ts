import { createRectangle } from '@flighthq/geometry';
import type { GlyphAtlas, Rectangle } from '@flighthq/types';

// Resets the atlas's dirty region to empty. Call it right after uploading the current dirty rect to
// the GPU texture so the next glyph addition starts a fresh region.
export function clearGlyphAtlasDirty(atlas: Readonly<GlyphAtlas>): void {
  atlas.runtime.dirty = false;
}

// Returns the union of every atlas rectangle written since the last `clearGlyphAtlasDirty` (a fresh
// `Rectangle`), or null when nothing has changed. A renderer uploads only this sub-rect of the atlas
// surface to its GPU texture, then clears it.
export function getGlyphAtlasDirtyRegion(atlas: Readonly<GlyphAtlas>): Rectangle | null {
  const runtime = atlas.runtime;
  if (!runtime.dirty) return null;
  return createRectangle(
    runtime.dirtyMinX,
    runtime.dirtyMinY,
    runtime.dirtyMaxX - runtime.dirtyMinX,
    runtime.dirtyMaxY - runtime.dirtyMinY,
  );
}
