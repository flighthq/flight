import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { detectSpritesheetFormat } from './spritesheetDetect.ts';

/** The namespace every spritesheet-format `document.format` requirement key carries. */
export const SPRITESHEET_REQUIREMENT_KEY_NAMESPACE = 'spritesheet';

/**
 * Whether any registered format recognises this text as a spritesheet.
 *
 * Separate from the requirement set because an empty set means both "read cleanly, needs nothing" and "not a
 * spritesheet at all", and a build that cannot tell those apart ships a bundle missing every parser the content
 * needed.
 */
export function isReadableSpritesheet(text: string): boolean {
  return detectSpritesheetFormat(text) !== null;
}

/**
 * Build-time inventory of what one spritesheet document asks a build to support: the ONE format whose parser
 * would read it.
 *
 * ★ EXACTLY WHAT THE SHIPPED DETECTOR PICKS. The registry consults formats in registration order and the first
 * whose `detect` returns true wins, so asking it is the only way to name the parser that will actually run. A
 * second implementation of the same sniffing would drift the moment a detector is tightened, and the
 * requirement would then name a format the importer does not use.
 *
 * Returns an EMPTY set for content no format recognises — there is no fallback parser, and claiming one would
 * put an implementation in the bundle that cannot read the file. Pair it with `isReadableSpritesheet` to tell
 * "requires nothing" from "could not be read".
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseSpritesheetRequirements(text: string): RequirementSet {
  const kind = detectSpritesheetFormat(text);
  const requirements: Requirement[] =
    kind === null
      ? []
      : [{ facet: RequirementFacet.DocumentFormat, key: `${SPRITESHEET_REQUIREMENT_KEY_NAMESPACE}.${kind}` }];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
