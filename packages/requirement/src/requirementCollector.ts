// Generated from crates/flight-requirement/src/requirement_collector.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { RequirementSetRaw } from './requirementSet.ts';
import { createRequirementSet } from './requirementSet.ts';
import type { Requirement, RequirementFacet } from './types.ts';

/**
 * Engages requirement recording for one Scene2D import. This is only a borrowed callback and
 * optional array-sink seam; it has no dependency on a Scene2D engine.
 */
export function collectScene2DRequirements(run: (arg0: Requirement[]) => void): RequirementSetRaw {
  let requirements: Requirement[] = [] as never[];
  run(requirements);
  return createRequirementSet(
    ['scene.blend-mode', 'scene.material-kind', 'scene.node-kind', 'scene.shape-command'],
    requirements,
  );
}

/**
 * Records one content fact when a collector is engaged; the default `undefined` path is a no-op.
 */
export function reportRequirement(sink: Requirement[] | undefined, facet: RequirementFacet, key: string): void {
  if (sink === undefined) {
    return;
  }
  sink.push({ facet: facet, key: String(key) });
}
