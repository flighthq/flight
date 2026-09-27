import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { detectTilemapFormat } from './tilemapDetect.ts';

/** The namespace every tilemap-domain `document.format` requirement key carries. */
export const TILEMAP_REQUIREMENT_KEY_NAMESPACE = 'tilemap';

/** Whether any registered format recognises this text as a tilemap or tileset document. */
export function isReadableTilemapDocument(text: string): boolean {
  return detectTilemapFormat(text) !== null;
}

/**
 * Build-time inventory of what one tilemap-domain document asks a build to support: the ONE format whose parser
 * would read it.
 *
 * ★ EXACTLY WHAT THE SHIPPED DETECTOR PICKS. The map-vs-tileset answer decides which of two parsers a build
 * needs and they are separate implementations, so re-deciding it here would be a second copy of the
 * discrimination — and the copy is what drifts. Asking the detector keeps this inventory naming the parser that
 * will actually run.
 *
 * Returns an EMPTY set for text no format recognises. Pair it with `isReadableTilemapDocument` to tell "requires
 * nothing" from "could not be read": a `.json` asset that is not a Tiled document at all reads as an empty set,
 * and a build that could not tell those apart would ship a bundle missing the parser the content needed.
 */
export function parseTilemapRequirements(text: string): RequirementSet {
  const kind = detectTilemapFormat(text);
  const requirements: Requirement[] =
    kind === null
      ? []
      : [{ facet: RequirementFacet.DocumentFormat, key: `${TILEMAP_REQUIREMENT_KEY_NAMESPACE}.${kind}` }];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
