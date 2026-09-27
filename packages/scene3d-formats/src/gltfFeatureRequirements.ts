import type { Requirement } from '@flighthq/types/contract';
import {
  RequirementFacet,
  SpecularGlossinessPbrMaterialKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types/contract';

export const GLTF_FEATURE_SCENE_REQUIREMENTS: ReadonlyMap<string, readonly Requirement[]> = new Map([
  ['Mesh', [{ facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind }]],
  ['KHR_materials_unlit', [{ facet: RequirementFacet.SceneMaterialKind, key: UnlitMaterialKind }]],
  [
    'KHR_materials_pbrSpecularGlossiness',
    [{ facet: RequirementFacet.SceneMaterialKind, key: SpecularGlossinessPbrMaterialKind }],
  ],
]);
