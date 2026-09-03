import { createEntity } from '@flighthq/entity/contract';
import type { Requirement, RequirementFacet, RequirementSet } from '@flighthq/types/contract';

export function createRequirementSet(
  covers: readonly RequirementFacet[],
  requirements: readonly Readonly<Requirement>[],
): RequirementSet {
  return createEntity({
    covers: distinctSorted(covers),
    requirements: distinctSortedRequirements(requirements),
  });
}

// A difference can claim completeness only where both operands inspected the facet. Requirements from
// an unshared facet are therefore unknown, not absent, and do not enter the result.
export function diffRequirementSets(
  requirements: Readonly<RequirementSet>,
  baseline: Readonly<RequirementSet>,
): RequirementSet {
  const covers = intersectSorted(requirements.covers, baseline.covers);
  const baselineKeys = new Set(
    baseline.requirements.map((requirement) => requirementIdentity(requirement.facet, requirement.key)),
  );
  return createRequirementSet(
    covers,
    requirements.requirements.filter(
      (requirement) =>
        covers.includes(requirement.facet) &&
        !baselineKeys.has(requirementIdentity(requirement.facet, requirement.key)),
    ),
  );
}

// A merged set is complete for a facet only when every input inspected it. Requirements themselves are
// unioned, because a partial producer can still contribute a positive fact without proving negatives.
export function mergeRequirementSets(requirementSets: readonly Readonly<RequirementSet>[]): RequirementSet {
  if (requirementSets.length === 0) return createRequirementSet([], []);
  let covers = distinctSorted(requirementSets[0].covers);
  const requirements: Readonly<Requirement>[] = [];
  for (const requirementSet of requirementSets) {
    covers = intersectSorted(covers, requirementSet.covers);
    requirements.push(...requirementSet.requirements);
  }
  return createRequirementSet(covers, requirements);
}

function distinctSorted(values: readonly RequirementFacet[]): RequirementFacet[] {
  return [...new Set(values)].sort();
}

function distinctSortedRequirements(requirements: readonly Readonly<Requirement>[]): Requirement[] {
  const byIdentity = new Map<string, Requirement>();
  for (const requirement of requirements) {
    byIdentity.set(requirementIdentity(requirement.facet, requirement.key), {
      facet: requirement.facet,
      key: requirement.key,
    });
  }
  return [...byIdentity.values()].sort((a, b) => a.facet.localeCompare(b.facet) || a.key.localeCompare(b.key));
}

function intersectSorted(first: readonly RequirementFacet[], second: readonly RequirementFacet[]): RequirementFacet[] {
  const secondValues = new Set(second);
  return distinctSorted(first.filter((value) => secondValues.has(value)));
}

function requirementIdentity(facet: RequirementFacet, key: string): string {
  return `${facet}\0${key}`;
}
