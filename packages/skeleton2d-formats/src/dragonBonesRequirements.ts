import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectDragonBonesSectionCounts } from './dragonBonesSectionCounts.ts';

export const DRAGONBONES_REQUIREMENT_KEY_NAMESPACE = 'dragonbones';

export function isReadableDragonBones(json: string): boolean {
  return collectDragonBonesSectionCounts(json) !== null;
}

export function parseDragonBonesRequirements(json: string): RequirementSet {
  const counts = collectDragonBonesSectionCounts(json);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const kind of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${DRAGONBONES_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
