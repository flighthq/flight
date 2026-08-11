import type { Kind, Requirement, RequirementFacet, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet as Facet } from '@flighthq/types/contract';

import { createRequirementSet } from './requirementSet';

// Engages requirement recording for one Scene2D import. Parsers receive the same optional-array sink
// shape as import diagnostics; an unengaged parse receives `undefined` and allocates no requirement.
export function collectScene2DRequirements(run: (sink: Requirement[]) => void): RequirementSet {
  const requirements: Requirement[] = [];
  run(requirements);
  return createRequirementSet(
    [Facet.SceneBlendMode, Facet.SceneMaterialKind, Facet.SceneNodeKind, Facet.SceneShapeCommand],
    requirements,
  );
}

// The colocated importer seam. Call it only where a parser has established the content fact; when no
// collector is engaged the default parse pays one undefined check and records nothing.
export function reportRequirement(sink: Requirement[] | undefined, facet: RequirementFacet, key: Kind): void {
  if (sink === undefined) return;
  sink.push({ facet, key });
}
