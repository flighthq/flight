import { createEntity } from '@flighthq/entity/contract';
import { findRegistryCatalogEntries } from '@flighthq/registry-catalog/contract';
import type {
  Entity,
  RegistryCatalog,
  RegistryCatalogEntry,
  RegistryCodegenPlan,
  Requirement,
  RequirementSet,
} from '@flighthq/types/contract';

// Resolve only facts here. A later emitter may choose how a row becomes source after the ownership lane
// is ruled; this kernel cannot encode that decision accidentally because it returns no source text.
export function createRegistryCodegenPlan(
  catalog: Readonly<RegistryCatalog>,
  requirements: Readonly<RequirementSet>,
  backend: string,
): RegistryCodegenPlan & Entity {
  const entries: RegistryCatalogEntry[] = [];
  const unresolved: Requirement[] = [];
  const seen = new Set<string>();

  for (const requirement of requirements.requirements) {
    const identity = requirementIdentity(requirement);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const matches = findRegistryCatalogEntries(catalog, backend, requirement.facet, requirement.key);
    if (matches.length === 0) {
      unresolved.push({ facet: requirement.facet, key: requirement.key });
    } else {
      entries.push(...matches);
    }
  }

  return createEntity({ backend, entries, unresolved });
}

function requirementIdentity(requirement: Readonly<Requirement>): string {
  return `${requirement.facet}\0${requirement.key}`;
}
