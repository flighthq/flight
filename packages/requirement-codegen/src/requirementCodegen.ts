import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { findRequirementCatalogEntries } from '@flighthq/requirement-catalog/contract';
import type {
  Entity,
  EntityConstruction,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementCodegenPlan,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';

export function createRequirementCodegenPlan(
  catalog: Readonly<RequirementCatalog>,
  requirements: Readonly<RequirementSet>,
  backend: string,
): RequirementCodegenPlan & Entity {
  const out = allocateEntity<RequirementCodegenPlan & Entity>();
  initializeRequirementCodegenPlan(out, catalog, requirements, backend);
  return finishEntity(out);
}

// Resolve only facts here. A later emitter may choose how a row becomes source after the ownership lane
// is ruled; this kernel cannot encode that decision accidentally because it returns no source text.
export function initializeRequirementCodegenPlan(
  out: EntityConstruction<RequirementCodegenPlan & Entity>,
  catalog: Readonly<RequirementCatalog>,
  requirements: Readonly<RequirementSet>,
  backend: string,
): void {
  const entries: RequirementCatalogEntry[] = [];
  const unresolved: Requirement[] = [];
  const seen = new Set<string>();
  for (const requirement of requirements.requirements) {
    const identity = requirementIdentity(requirement);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const matches = findRequirementCatalogEntries(catalog, backend, requirement.facet, requirement.key);
    if (matches.length === 0) {
      unresolved.push({ facet: requirement.facet, key: requirement.key });
    } else {
      entries.push(...matches);
    }
  }
  out.backend = backend;
  out.entries = entries;
  out.unresolved = unresolved;
}

function requirementIdentity(requirement: Readonly<Requirement>): string {
  return `${requirement.facet}\0${requirement.key}`;
}
