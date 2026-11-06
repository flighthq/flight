import { BlinnPhongMaterialKind } from '@flighthq/materials/contract';
import type { Requirement } from '@flighthq/requirement/contract';
import { RequirementFacet } from '@flighthq/requirement/contract';

/**
 * Which scene requirements an MD5 mesh feature implies — the fact that turns a FORMAT requirement
 * into a RENDERER requirement at build time.
 *
 * The MD5 mesh counterpart of `THREE_DS_CHUNK_SCENE_REQUIREMENTS`. Keyed by the feature name that
 * `collectMd5MeshFeatures` returns (the same name `parseMd5MeshRequirements` emits under
 * `document.format`), and each entry is a list of scene-level requirements the feature implies.
 *
 * MD5 shaders are texture paths decoded as BlinnPhongMaterial.
 */
export const MD5_MESH_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  ['Material', [{ facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind }]],
]);
