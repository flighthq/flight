import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSpineBinarySectionCounts } from './spineBinarySectionCounts.ts';

export const SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE = 'spine-binary';

export function isReadableSpineBinary(source: Readonly<Uint8Array>): boolean {
  return collectSpineBinarySectionCounts(source) !== null;
}

export function parseSpineBinaryRequirements(source: Readonly<Uint8Array>): RequirementSet {
  const counts = collectSpineBinarySectionCounts(source);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const kind of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${SPINE_BINARY_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
