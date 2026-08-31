import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setBitmapTextLayoutGuard } from './updateBitmapText';

/** Uninstalls the guard installed by `enableBitmapTextGuards`. */
export function disableBitmapTextGuards(): void {
  setBitmapTextLayoutGuard(null);
}

/**
 * Installs the caller-facing bitmap-text guard (opt-in, dev-only). It warns once — through
 * `@flighthq/log` — when a layout never settles:
 *
 * **The layout did not converge.** `updateBitmapText` re-runs a layout whose glyph rects a repack
 * invalidated mid-pass, and it ran out of passes. The string needs more glyphs resident at once than
 * the atlas can hold, so rasterizing the end of it evicts the start, every pass invalidates the one
 * before, and the quads that get drawn sample whatever displaced them. Unlike a full cache this does
 * not resolve itself with use: the atlas has to be bigger or the font smaller.
 *
 * Pair with `isBitmapTextGlyphLayoutStale` for a pull-style answer about one node, and with
 * `enableGlyphAtlasGuards` for the atlas-side view of the same pressure — that one reports the repacks
 * and the glyphs they drop, this one reports the text that could not be laid out through them. Not
 * importing this module costs production nothing: the wording and the `@flighthq/log` dependency live
 * only here.
 */
export function enableBitmapTextGuards(): void {
  setBitmapTextLayoutGuard(warnOnBitmapTextLayoutBlocked);
}

function warnOnBitmapTextLayoutBlocked(_reason: string, attempts: number): void {
  logOnce(
    'bitmaptext:layout-did-not-converge',
    LogLevel.Warn,
    {
      message:
        `updateBitmapText: the glyph source repacked during all ${attempts} layout passes, so this text ` +
        'never settled — its glyphs cannot all be resident in the atlas at once, and the quads drawn from ' +
        'the final pass sample stale rects. Enlarge the glyph atlas or reduce the font size; ' +
        'enableGlyphAtlasGuards reports the repacks from the atlas side.',
    },
    'bitmaptext',
  );
}
