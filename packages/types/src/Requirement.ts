import type { Entity } from './Entity';
import type { Kind } from './Entity';
import type { RequirementFacet } from './RequirementFacet';

// One producer fact. It names content in the producer's vocabulary and deliberately carries no backend,
// registry, or registrar identity; only the consumer can map the requirement to an implementation.
export interface Requirement {
  readonly facet: RequirementFacet;
  readonly key: Kind;
}

// `covers` makes completeness explicit. A missing requirement is evidence of absence only for facets the
// producer says it inspected.
export interface RequirementSet extends Entity {
  readonly covers: readonly RequirementFacet[];
  readonly requirements: readonly Readonly<Requirement>[];
}
