import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { collectSvgCounts } from './svgCounts.ts';

export const SVG_REQUIREMENT_KEY_NAMESPACE = 'svg';

export function isReadableSvg(source: string): boolean {
  return collectSvgCounts(source) !== null;
}

export function parseSvgRequirements(source: string): RequirementSet {
  const counts = collectSvgCounts(source);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const kind of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${SVG_REQUIREMENT_KEY_NAMESPACE}.${kind}`,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat], requirements);
}
