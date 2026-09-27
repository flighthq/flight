import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { detectBitmapFontFormat } from './bitmapFontDetect.ts';

/** The namespace every bitmap font `document.format` requirement key carries. */
export const BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE = 'bitmapfont';

/** Whether any registered format recognises these bytes as a bitmap font descriptor. */
export function isReadableBitmapFont(bytes: Readonly<Uint8Array>): boolean {
  return detectBitmapFontFormat(bytes) !== null;
}

/**
 * Build-time inventory of what one bitmap font descriptor asks a build to support: the ONE format whose front end
 * would read it.
 *
 * ★ EXACTLY WHAT THE SHIPPED DETECTOR PICKS. BMFont writes its binary, text and XML forms all under `.fnt`, so
 * the format is knowable only from the content — a build that guessed from the extension would link the wrong
 * front end for two of the three. Asking the detector keeps this inventory naming the parser that will run.
 *
 * Returns an EMPTY set for bytes no format recognises. Pair it with `isReadableBitmapFont` to tell "requires
 * nothing" from "could not be read".
 */
export function parseBitmapFontRequirements(bytes: Readonly<Uint8Array>): RequirementSet {
  const kind = detectBitmapFontFormat(bytes);
  const requirements: Requirement[] =
    kind === null
      ? []
      : [{ facet: RequirementFacet.DocumentFormat, key: `${BITMAP_FONT_REQUIREMENT_KEY_NAMESPACE}.${kind}` }];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
