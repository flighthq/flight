import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet, THREE_DS_MATERIAL } from '@flighthq/types/contract';

import { THREE_DS_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';
import { collectThreeDsChunkCounts, getThreeDsChunkName } from './threeDsChunkCensus.ts';

/**
 * Build-time inventory of what one 3DS file asks a build to support: one `document.format`
 * requirement per distinct feature chunk type the file contains, plus a deterministic
 * `scene.material-kind` requirement for `BlinnPhongMaterial` when the file carries at least one
 * material block.
 *
 * This replaces the coarse namespace-level material assumption in `scene3dFormatRequirements.ts`
 * (`THREE_DS_DOCUMENT_SCENE_REQUIREMENTS`) with a content-aware one: a 3DS file that carries only
 * geometry and no materials does not claim a BlinnPhong renderer.
 *
 * Keys are namespaced by format (`3ds.Trimesh`, `3ds.Material`, `3ds.Light`, `3ds.Camera`,
 * `3ds.KeyframeObjectNode`) — the `document.format` facet is shared by every format Flight reads,
 * and a bare feature name is not unique across them.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseThreeDsRequirements(source: Readonly<Uint8Array>): RequirementSet {
  const counts = collectThreeDsChunkCounts(source);
  const requirements: Requirement[] = [];
  if (counts !== null) {
    for (const chunkId of counts.keys()) {
      requirements.push({
        facet: RequirementFacet.DocumentFormat,
        key: `${THREE_DS_REQUIREMENT_KEY_NAMESPACE}.${getThreeDsChunkName(chunkId)}`,
      });
    }
    if (counts.has(THREE_DS_MATERIAL)) {
      requirements.push({
        facet: RequirementFacet.SceneMaterialKind,
        key: BlinnPhongMaterialKind,
      });
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
