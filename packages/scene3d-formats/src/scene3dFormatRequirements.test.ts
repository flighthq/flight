import { BlinnPhongMaterialKind, RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

import {
  COLLADA_DOCUMENT_SCENE_REQUIREMENTS,
  COLLADA_REQUIREMENT_KEY_NAMESPACE,
  MD2_DOCUMENT_SCENE_REQUIREMENTS,
  MD2_REQUIREMENT_KEY_NAMESPACE,
  MD5_DOCUMENT_SCENE_REQUIREMENTS,
  MD5_REQUIREMENT_KEY_NAMESPACE,
  OBJ_DOCUMENT_SCENE_REQUIREMENTS,
  OBJ_REQUIREMENT_KEY_NAMESPACE,
  THREE_DS_DOCUMENT_SCENE_REQUIREMENTS,
  THREE_DS_REQUIREMENT_KEY_NAMESPACE,
} from './scene3dFormatRequirements.ts';

describe('scene3dFormatRequirements', () => {
  it('maps 3DS to BlinnPhong', () => {
    expect(THREE_DS_REQUIREMENT_KEY_NAMESPACE).toBe('3ds');
    expect(THREE_DS_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('maps Collada to StandardPbr', () => {
    expect(COLLADA_REQUIREMENT_KEY_NAMESPACE).toBe('dae');
    expect(COLLADA_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('maps MD2 to BlinnPhong', () => {
    expect(MD2_REQUIREMENT_KEY_NAMESPACE).toBe('md2');
    expect(MD2_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('maps MD5 to BlinnPhong', () => {
    expect(MD5_REQUIREMENT_KEY_NAMESPACE).toBe('md5');
    expect(MD5_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('maps OBJ to both BlinnPhong and StandardPbr', () => {
    expect(OBJ_REQUIREMENT_KEY_NAMESPACE).toBe('obj');
    expect(OBJ_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
    expect(OBJ_DOCUMENT_SCENE_REQUIREMENTS).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('uses distinct namespaces', () => {
    const namespaces = [
      COLLADA_REQUIREMENT_KEY_NAMESPACE,
      MD2_REQUIREMENT_KEY_NAMESPACE,
      MD5_REQUIREMENT_KEY_NAMESPACE,
      OBJ_REQUIREMENT_KEY_NAMESPACE,
      THREE_DS_REQUIREMENT_KEY_NAMESPACE,
    ];
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });
});
