import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setGlyphAtlasEntryGuard } from './glyphAtlasEntry';

/** Uninstalls the guard installed by `enableGlyphAtlasGuards`. */
export function disableGlyphAtlasGuards(): void {
  setGlyphAtlasEntryGuard(null);
}

/**
 * Installs the caller-facing glyph-atlas guard (opt-in, dev-only). `getGlyphAtlasEntry` returns a null
 * sentinel for several unrelated situations, and a renderer that draws nothing gives no clue which one
 * it hit. This warns once — through `@flighthq/log` — for each:
 *
 * **The rasterizer produced nothing.** No canvas in this host, a font missing that glyph, or a backend
 * that declined. Text silently does not render, which reads as a layout bug rather than a font one.
 *
 * **The glyph is larger than the atlas.** No amount of eviction can make room, so unlike a full cache
 * this never resolves itself: the atlas needs to be bigger or the font smaller.
 *
 * **A repack dropped a cached glyph.** The packer could not place a glyph it had already accepted, so
 * it was evicted mid-repack. One is unremarkable under pressure; a stream of them means the atlas is
 * thrashing and every dropped glyph will be re-rasterized on its next use.
 *
 * Pair with `explainGlyphAtlasEntry` for a pull-style answer about one codepoint. Not importing this
 * module costs production nothing: the messages and the `@flighthq/log` dependency live only here.
 */
export function enableGlyphAtlasGuards(): void {
  setGlyphAtlasEntryGuard(warnOnGlyphAtlasEntryBlocked);
}

function warnOnGlyphAtlasEntryBlocked(reason: string, codepoint: number): void {
  const printable = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
  if (reason === 'rasterizer-returned-null') {
    logOnce(
      'glyphatlas:rasterizer-returned-null',
      LogLevel.Warn,
      {
        message:
          `getGlyphAtlasEntry: the rasterizer produced nothing for ${printable}, so it will not render. ` +
          'The host may have no canvas, the font may not cover this codepoint, or a custom backend declined.',
      },
      'glyphatlas',
    );
    return;
  }
  if (reason === 'glyph-larger-than-atlas') {
    logOnce(
      'glyphatlas:glyph-larger-than-atlas',
      LogLevel.Warn,
      {
        message:
          `getGlyphAtlasEntry: ${printable} rasterizes larger than the atlas's usable area, so it can never ` +
          'be placed however much is evicted. Enlarge the atlas or reduce the font size; ' +
          'explainGlyphAtlasEntry reports the measured sizes.',
      },
      'glyphatlas',
    );
    return;
  }
  logOnce(
    'glyphatlas:repack-dropped',
    LogLevel.Warn,
    {
      message:
        `getGlyphAtlasEntry: a repack could not replace ${printable} and dropped it. Occasional drops are ` +
        'normal under pressure; repeated ones mean the atlas is thrashing and glyphs are being ' +
        're-rasterized on every use. Consider a larger atlas or a byte/area budget.',
    },
    'glyphatlas',
  );
}
