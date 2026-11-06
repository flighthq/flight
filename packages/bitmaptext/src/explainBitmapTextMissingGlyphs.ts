import type { GlyphSource } from '@flighthq/glyphatlas/contract';

import type { BitmapTextMissingGlyphs } from './types.ts';

export function explainBitmapTextMissingGlyphs(
  glyphSource: Readonly<GlyphSource>,
  text: string,
): BitmapTextMissingGlyphs {
  const seen = new Set<number>();
  const missing: number[] = [];
  let totalCodepoints = 0;

  for (const character of text) {
    const codepoint = character.codePointAt(0);
    if (codepoint === undefined) continue;
    if (codepoint === 0x0a || codepoint === 0x0d) continue;
    totalCodepoints++;
    if (seen.has(codepoint)) continue;
    seen.add(codepoint);
    if (glyphSource.getGlyphEntry(codepoint) === null) {
      missing.push(codepoint);
    }
  }

  return { missingCodepoints: missing, totalCodepoints };
}
