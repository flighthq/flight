import { logOnce } from '@flighthq/log/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setBitmapFontGuard } from './bitmapFont';

/** Uninstalls the guard installed by `enableBitmapFontGuards`. */
export function disableBitmapFontGuards(): void {
  setBitmapFontGuard(null);
}

/**
 * Installs the caller-facing bitmap-font guard (opt-in, dev-only). `createBitmapFont` repairs bad source
 * data rather than rejecting it, and a repair is invisible from the outside — the font builds, every
 * lookup succeeds, and the glyph simply samples the wrong page. This warns once, through `@flighthq/log`,
 * for the repair it makes:
 *
 * **A glyph names a page the font does not have.** The glyph is clamped onto the primary page so it is
 * still drawn, which is the right call for a font that must survive a bad asset — but it samples
 * whatever happens to sit at those coordinates on page 0. That renders as a garbled glyph or a slice of
 * a neighbour, which reads as an atlas-packing bug rather than the font-file defect it is.
 *
 * Pair with `explainBitmapFontGlyph` for a pull-style answer about one codepoint. Not importing this
 * module costs production nothing: the messages and the `@flighthq/log` dependency live only here.
 */
export function enableBitmapFontGuards(): void {
  setBitmapFontGuard(warnOnBitmapFontRepair);
}

// Dispatched per reason rather than filtered, matching the glyph-atlas guard: a reason with no branch
// here logs nothing, which is the safe default when the core grows a repair this module has not been
// taught to describe. There is one reason today, so the no-match path is unreachable by construction and
// carries no test — a second reason adds its own branch rather than reusing this one's wording.
function warnOnBitmapFontRepair(reason: string, codepoint: number, page: number): void {
  if (reason !== 'page-out-of-range') return;
  const printable = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
  logOnce(
    'bitmapfont:page-out-of-range',
    LogLevel.Warn,
    {
      message:
        `createBitmapFont: ${printable} names page ${page}, which this font does not have, so it was ` +
        'placed on page 0 and will sample whatever occupies those coordinates there. The font data is ' +
        'wrong, not the atlas — check the page index the exporter wrote.',
    },
    'bitmapfont',
  );
}
