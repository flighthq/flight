import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { detectTextureAtlasFormat } from './textureAtlasDetect.ts';

/** The namespace every texture-atlas `document.format` requirement key carries. */
export const TEXTURE_ATLAS_REQUIREMENT_KEY_NAMESPACE = 'textureatlas';

/** Whether any registered format recognises this content as a texture atlas. */
export function isReadableTextureAtlas(content: string): boolean {
  return detectTextureAtlasFormat(content) !== null;
}

/**
 * Build-time inventory of what one texture-atlas document asks a build to support: the ONE format whose parser
 * would read it.
 *
 * ★ EXACTLY WHAT THE SHIPPED DETECTOR PICKS. Aseprite and TexturePacker JSON share a `{ frames, meta }` shape
 * and are told apart by `meta.app`, falling back to an Aseprite-only per-frame field — a discrimination with
 * real edge cases that belongs in one place. Asking the detector is what keeps this inventory naming the parser
 * that will actually run.
 *
 * Returns an EMPTY set for content no format recognises. Pair it with `isReadableTextureAtlas` to tell "requires
 * nothing" from "could not be read".
 *
 * ★ THE SAME DOCUMENT MAY ALSO BE A SPRITESHEET, and that is not a conflict to resolve here. The spritesheet and
 * texture-atlas registries both read Aseprite, LibgdxAtlas, Starling and TexturePacker, so one file can be
 * legitimately usable as either. Each family answers only for itself; a caller analysing a shared extension
 * unions what the families report rather than picking between them.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseTextureAtlasRequirements(content: string): RequirementSet {
  const kind = detectTextureAtlasFormat(content);
  const requirements: Requirement[] =
    kind === null
      ? []
      : [{ facet: RequirementFacet.DocumentFormat, key: `${TEXTURE_ATLAS_REQUIREMENT_KEY_NAMESPACE}.${kind}` }];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
