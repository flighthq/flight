import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { detectParticleFormat } from './detect.ts';
import { registerBuiltInParticleFormats } from './registerBuiltInParticleFormats.ts';

/** The namespace every particle-format `document.format` requirement key carries. */
export const PARTICLE_REQUIREMENT_KEY_NAMESPACE = 'particles';

/**
 * Whether any registered codec recognises this text as a particle config.
 *
 * Separate from the requirement set because an empty set means both "read cleanly, needs nothing" and "not a
 * particle config at all", and a build that cannot tell those apart ships a bundle missing every codec the
 * content needed.
 */
export function isReadableParticleConfig(text: string): boolean {
  return detectRegisteredParticleKind(text) !== null;
}

/**
 * Build-time inventory of what one particle config asks a build to support: the ONE format whose codec would
 * parse it.
 *
 * ★ EXACTLY WHAT THE SHIPPED DETECTOR PICKS, NOT A GUESS AT IT. The registry consults codecs in registration
 * order and the first whose `detect` returns true wins, so several codecs can match the same text and only the
 * winner is the codec that will actually parse it. This asks the registry rather than re-deciding: a
 * re-implementation would drift the moment a codec's detect is tightened or the built-in order changes, and
 * the requirement would then name a codec the importer does not use.
 *
 * Returns an EMPTY set for content no codec recognises, which is the honest answer — there is no fallback codec
 * and claiming one would put an implementation in the bundle that cannot read the file. Pair it with
 * `isReadableParticleConfig` to tell "requires nothing" from "could not be read".
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseParticleRequirements(text: string): RequirementSet {
  const kind = detectRegisteredParticleKind(text);
  const requirements: Requirement[] =
    kind === null
      ? []
      : [{ facet: RequirementFacet.DocumentFormat, key: `${PARTICLE_REQUIREMENT_KEY_NAMESPACE}.${kind}` }];
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}

/**
 * Detects through the registry, installing the built-in codecs first.
 *
 * ★ THE INSTALL IS HERE RATHER THAN AT MODULE SCOPE, DELIBERATELY. The particles registry is module-level
 * state that `registerBuiltInParticleFormats` mutates, and detection returns null for everything until it has
 * run — so an analysis function that skipped it would report every built-in format as unrecognised. Calling it
 * at import time would make importing this module mutate a registry, which this repository bans; calling it
 * here keeps the side effect inside the function a caller invoked. It is idempotent, so a caller who already
 * installed the built-ins, or registered their own codec for a built-in kind, is unaffected: re-registering the
 * same kind is last-write-wins and does not change detection order.
 */
function detectRegisteredParticleKind(text: string): string | null {
  registerBuiltInParticleFormats();
  return detectParticleFormat(text);
}
