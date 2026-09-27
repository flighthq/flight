import { createRequirementSet } from '@flighthq/requirement/contract';
import type { GltfDocument, Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { GLTF_FEATURE_SCENE_REQUIREMENTS } from './gltfFeatureRequirements.ts';
import { collectGlbFeatures, collectGltfFeatures } from './gltfFeatures.ts';
import { GLTF_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

export function parseGlbRequirements(source: Readonly<Uint8Array>): RequirementSet {
  return buildGltfRequirementSet(collectGlbFeatures(source));
}

export function parseGltfRequirements(source: GltfDocument | string): RequirementSet {
  return buildGltfRequirementSet(collectGltfFeatures(source));
}

function buildGltfRequirementSet(features: ReadonlySet<string> | null): RequirementSet {
  const requirements: Requirement[] = [];
  if (features !== null) {
    for (const feature of [...features].sort()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${GLTF_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
      });
      const sceneRequirements = GLTF_FEATURE_SCENE_REQUIREMENTS.get(feature);
      if (sceneRequirements !== undefined) {
        for (const req of sceneRequirements) requirements.push(req);
      }
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
