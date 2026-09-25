import type { Requirement } from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

export const COLLADA_REQUIREMENT_KEY_NAMESPACE = 'dae';

export const COLLADA_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [
  { facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind },
];

export const MD2_REQUIREMENT_KEY_NAMESPACE = 'md2';

export const MD2_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [
  { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
];

export const MD5_REQUIREMENT_KEY_NAMESPACE = 'md5';

export const MD5_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [
  { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
];

export const OBJ_REQUIREMENT_KEY_NAMESPACE = 'obj';

export const OBJ_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [
  { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
  { facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind },
];

export const THREE_DS_REQUIREMENT_KEY_NAMESPACE = '3ds';

export const THREE_DS_DOCUMENT_SCENE_REQUIREMENTS: readonly Requirement[] = [
  { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
];
