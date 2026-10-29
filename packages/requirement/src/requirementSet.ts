// Generated from crates/flight-requirement/src/requirement_set.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityRaw } from '@flighthq/entity/contract';

import type { Requirement, RequirementFacet } from './types.ts';
import { getRequirementFacetString } from './types.ts';

/**
 * A canonical set of producer facts and the facets for which missing facts prove absence.
 */
export interface RequirementSetRaw extends EntityRaw {
  readonly covers: RequirementFacet[];
  readonly requirements: Requirement[];
}

export function createRequirementSet(
  covers: Readonly<RequirementFacet[]>,
  requirements: Readonly<Requirement[]>,
): RequirementSetRaw {
  let out: RequirementSetRaw = Object.assign(allocateEntity<RequirementSetRaw>(), { covers: [], requirements: [] });
  initializeRequirementSet(out, covers, requirements);
  return out;
}

/**
 * Subtracts facts only for facets that both operands inspected.
 */
export function diffRequirementSets(
  requirements: Readonly<RequirementSetRaw>,
  baseline: Readonly<RequirementSetRaw>,
): RequirementSetRaw {
  const covers = intersectSorted(requirements.covers, baseline.covers);
  let difference: Requirement[] = [] as never[];
  for (const requirement of requirements.requirements) {
    if (covers.includes(requirement.facet) && findRequirement(baseline.requirements, requirement) === undefined) {
      difference.push(requirement);
    }
  }
  return createRequirementSet(covers, difference);
}

export function initializeRequirementSet(
  out: EntityConstruction<RequirementSetRaw>,
  covers: Readonly<RequirementFacet[]>,
  requirements: Readonly<Requirement[]>,
): void {
  out.covers = distinctSorted(covers);
  out.requirements = distinctSortedRequirements(requirements);
}

function distinctSorted(values: Readonly<RequirementFacet[]>): RequirementFacet[] {
  let ordered: RequirementFacet[] = [] as never[];
  for (const value of values) {
    if (!ordered.includes(value)) {
      ordered.push(value);
    }
  }
  ordered.sort((a, b) => {
    const left: string = getRequirementFacetString(a);
    const right: string = getRequirementFacetString(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return ordered;
}

function distinctSortedRequirements(requirements: Readonly<Requirement[]>): Requirement[] {
  let ordered: Requirement[] = [] as never[];
  for (const requirement of requirements) {
    let replaced = false;
    let index: number = 0;
    while (index < ordered.length) {
      if (ordered[index].facet === requirement.facet && ordered[index].key === requirement.key) {
        ordered[index] = requirement;
        replaced = true;
        break;
      }
      index += 1;
    }
    if (!replaced) {
      ordered.push(requirement);
    }
  }
  ordered.sort((a, b) => {
    const left: string = getRequirementFacetString(a.facet);
    const right: string = getRequirementFacetString(b.facet);
    if (left !== right) {
      return left < right ? -1 : left > right ? 1 : 0;
    }
    const leftKey: string = a.key;
    const rightKey: string = b.key;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return ordered;
}

function findRequirement(requirements: Readonly<Requirement[]>, probe: Readonly<Requirement>): number | undefined {
  let index: number = 0;
  while (index < requirements.length) {
    if (requirements[index].facet === probe.facet && requirements[index].key === probe.key) {
      return index;
    }
    index += 1;
  }
  return undefined;
}

function intersectSorted(
  first: Readonly<RequirementFacet[]>,
  second: Readonly<RequirementFacet[]>,
): RequirementFacet[] {
  let intersection: RequirementFacet[] = [] as never[];
  for (const value of first) {
    if (second.includes(value)) {
      intersection.push(value);
    }
  }
  return distinctSorted(intersection);
}

/**
 * Unions known facts while retaining completeness only for facets every input inspected.
 */
export function mergeRequirementSets(requirementSets: Readonly<Readonly<RequirementSetRaw>[]>): RequirementSetRaw {
  const first = requirementSets[0];
  if (first === undefined) {
    return createRequirementSet([], []);
  }
  let covers = distinctSorted(first.covers);
  let requirements: Requirement[] = [] as never[];
  for (const requirementSet of requirementSets) {
    covers = intersectSorted(covers, requirementSet.covers);
    for (const requirement of requirementSet.requirements) {
      requirements.push(requirement);
    }
  }
  return createRequirementSet(covers, requirements);
}
