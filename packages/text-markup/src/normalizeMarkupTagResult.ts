// Generated from crates/flight-text-markup/src/normalize_markup_tag_result.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { TextFormat } from '@flighthq/textformat/contract';

import type { MarkupTagEffect, MarkupTagResult } from './types.ts';

/**
 * Normalizes a handler's structural union to the effect shape consumed by the parser.
 */
export function normalizeMarkupTagResult(result: MarkupTagResult): MarkupTagEffect {
  return (() => {
    const matchValue = result;
    if (
      Object.hasOwn(matchValue, 'breakBefore') ||
      Object.hasOwn(matchValue, 'format') ||
      Object.hasOwn(matchValue, 'text')
    ) {
      const effect = matchValue as MarkupTagEffect;
      return effect;
    } else {
      const format = matchValue as TextFormat;
      return (() => {
        const fallbackFormat: TextFormat = format;
        return { breakBefore: undefined, format: fallbackFormat, text: undefined };
      })();
    }
  })();
}
