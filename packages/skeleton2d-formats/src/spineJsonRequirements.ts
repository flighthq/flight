import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSpineJsonSectionCounts } from './spineJsonSectionCounts.ts';

export const SPINE_JSON_REQUIREMENT_KEY_NAMESPACE = 'spine-json';

export function isReadableSpineJson(json: string): boolean {
  return collectSpineJsonSectionCounts(json) !== null;
}

export function parseSpineJsonRequirements(json: string): RequirementSet {
  const counts = collectSpineJsonSectionCounts(json);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const kind of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${SPINE_JSON_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
