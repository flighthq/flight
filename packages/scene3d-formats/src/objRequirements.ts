import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { OBJ_FEATURE_SCENE_REQUIREMENTS } from './objFeatureRequirements.ts';
import { collectObjFeatures } from './objFeatures.ts';
import { OBJ_REQUIREMENT_KEY_NAMESPACE } from './scene3dFormatRequirements.ts';

/**
 * Build-time inventory of what one OBJ file asks a build to support: one `document.format`
 * requirement per distinct feature the file contains, plus `scene.material-kind` requirements
 * when the file references materials.
 *
 * ★ PER FEATURE, NOT PER FORMAT. The coarse version (`OBJ_DOCUMENT_SCENE_REQUIREMENTS`) emitted
 * both BlinnPhong and StandardPbr for every `.obj` file regardless of content. A geometry-only OBJ
 * does not need any material renderer, and this inventory reflects that.
 *
 * Because the analyzer sees OBJ text but not the resolved MTL content, a file that references
 * materials (`usemtl` or `mtllib`) conservatively claims both BlinnPhong and StandardPbr: the
 * shading model depends on the MTL directives, which are in a separate file the analyzer does not
 * open.
 *
 * Keys are namespaced by format (`obj.Face`, `obj.Line`, `obj.Point`, `obj.Material`) — the
 * `document.format` facet is shared by every format Flight reads, and `Material` especially is a
 * name every 3D format reuses.
 *
 * Contract lane only: build-time analysis input, not something a running app asks for.
 */
export function parseObjRequirements(source: string): RequirementSet {
  const features = collectObjFeatures(source);
  const requirements: Requirement[] = [];
  for (const feature of [...features].sort()) {
    requirements.push({
      facet: RequirementFacet.DocumentFormat,
      key: `${OBJ_REQUIREMENT_KEY_NAMESPACE}.${feature}`,
    });
    const sceneRequirements = OBJ_FEATURE_SCENE_REQUIREMENTS.get(feature);
    if (sceneRequirements !== undefined) {
      for (const req of sceneRequirements) requirements.push(req);
    }
  }
  return createRequirementSet([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind], requirements);
}
