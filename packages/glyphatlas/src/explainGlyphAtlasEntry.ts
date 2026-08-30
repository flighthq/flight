import type { GlyphAtlas, GlyphAtlasEntryExplanation } from '@flighthq/types/contract';

/** Reports why `getGlyphAtlasEntry` returns null for `codepoint`, as plain data.
 *
 *  `getGlyphAtlasEntry` returns a null sentinel for two genuinely different situations — a rasterizer
 *  that cannot produce the glyph, and a glyph too large for the atlas — and the caller's remedy differs:
 *  the first wants a different font or host, the second a larger atlas. The sentinel cannot carry that
 *  distinction, so this query answers it separately rather than the lookup growing an error type.
 *
 *  Recomputed against the backend pinned to this atlas, so it reflects the atlas as it stands now. It rasterizes the
 *  glyph to measure it, which is the same work the lookup does; call it when diagnosing, not per frame.
 *  A cached glyph reports `ok` without re-measuring. */
export function explainGlyphAtlasEntry(atlas: Readonly<GlyphAtlas>, codepoint: number): GlyphAtlasEntryExplanation {
  const runtime = atlas.runtime;
  const padding = runtime.padding;
  const usableWidth = runtime.bitmap.width - 2 * padding;
  const usableHeight = runtime.bitmap.height - 2 * padding;

  if (runtime.entries.has(codepoint)) {
    const entry = runtime.entries.get(codepoint)!;
    return {
      renderable: true,
      reason: 'ok',
      glyphWidth: entry.width,
      glyphHeight: entry.height,
      usableWidth,
      usableHeight,
    };
  }

  const bitmap = runtime.rasterizerBackend.rasterize(codepoint, runtime.rasterizeOptions);
  if (bitmap === null) {
    return {
      renderable: false,
      reason: 'rasterizer-returned-null',
      glyphWidth: 0,
      glyphHeight: 0,
      usableWidth,
      usableHeight,
    };
  }
  const fits = bitmap.width <= usableWidth && bitmap.height <= usableHeight;
  return {
    renderable: fits,
    reason: fits ? 'ok' : 'glyph-larger-than-atlas',
    glyphWidth: bitmap.width,
    glyphHeight: bitmap.height,
    usableWidth,
    usableHeight,
  };
}
