import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSetRaw as RequirementSet } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/requirement/contract';

import { collectLottieCounts } from './lottieCounts.ts';

export const LOTTIE_REQUIREMENT_KEY_NAMESPACE = 'lottie';

export function isReadableLottie(json: string): boolean {
  return collectLottieCounts(json) !== null;
}

export function parseLottieRequirements(json: string): RequirementSet {
  const counts = collectLottieCounts(json);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const kind of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${LOTTIE_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
