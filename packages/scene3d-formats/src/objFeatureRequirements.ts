import type { Requirement } from '@flighthq/types/contract';
import {
  BlinnPhongMaterialKind,
  OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  RequirementFacet,
  StandardPbrMaterialKind,
} from '@flighthq/types/contract';

/**
 * Which scene requirements an OBJ feature implies — the fact that turns a FORMAT requirement into
 * a RENDERER requirement at build time.
 *
 * The OBJ counterpart of `THREE_DS_CHUNK_SCENE_REQUIREMENTS`. Keyed by the feature name that
 * `collectObjFeatures` returns (the same name `parseObjRequirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the feature implies.
 *
 * ★ PER SHADING MODEL, BECAUSE THE MTL IS NOW READ. This used to key on one coarse `Material` feature and
 * emit BOTH BlinnPhong and StandardPbr, because the analyzer saw OBJ bytes and not the resolved MTL — so
 * every classic-MTL model dragged the StandardPbr renderer into the bundle. The analyzer resolves the
 * `mtllib` now, so each model implies exactly its own renderer.
 *
 * A library declaring both models yields both features and therefore both renderers, which is correct: MTL
 * allows a shading model per material and the importer dispatches per material.
 */
export const OBJ_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  [OBJ_MATERIAL_BLINN_PHONG_FEATURE, [{ facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind }]],
  [OBJ_MATERIAL_STANDARD_PBR_FEATURE, [{ facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind }]],
]);
