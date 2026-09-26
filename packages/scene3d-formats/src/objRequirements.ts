import { createRequirementSet } from '@flighthq/requirement/contract';
import type { Requirement, RequirementSet } from '@flighthq/types/contract';
import {
  OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  RequirementFacet,
} from '@flighthq/types/contract';

import { OBJ_FEATURE_SCENE_REQUIREMENTS } from './objFeatureRequirements.ts';
import { collectObjFeatures, OBJ_MATERIAL_FEATURE } from './objFeatures.ts';
import { collectObjMaterialModels } from './objMaterialModel.ts';
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
export function parseObjRequirements(source: string, materialLibraries: readonly string[] = []): RequirementSet {
  const features = new Set(collectObjFeatures(source));
  // ★ THE COARSE `Material` FEATURE IS REPLACED, NEVER KEPT ALONGSIDE. It states only that the file
  // references materials; the shading models state which handlers and renderers those materials need, and
  // emitting both would put an unresolvable key next to the precise ones.
  //
  // With no library text supplied — none referenced, or the build could not read one — the models cannot be
  // determined, so BOTH are claimed. That is the safe superset: it keeps the build working at the cost of the
  // precision this function exists for, and it is strictly better than claiming a model the file may not use.
  if (features.delete(OBJ_MATERIAL_FEATURE)) {
    const models = new Set<string>();
    for (const library of materialLibraries) {
      for (const model of collectObjMaterialModels(library)) models.add(model);
    }
    if (models.size === 0) {
      models.add(OBJ_MATERIAL_BLINN_PHONG_FEATURE);
      models.add(OBJ_MATERIAL_STANDARD_PBR_FEATURE);
    }
    for (const model of models) features.add(model);
  }
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
