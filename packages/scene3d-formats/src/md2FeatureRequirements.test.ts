import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { MD2_FEATURE_SCENE_REQUIREMENTS } from './md2FeatureRequirements.ts';

describe('MD2_FEATURE_SCENE_REQUIREMENTS', () => {
  it('maps Material to BlinnPhong', () => {
    expect(MD2_FEATURE_SCENE_REQUIREMENTS.get('Material')).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('does not map non-material features', () => {
    expect(MD2_FEATURE_SCENE_REQUIREMENTS.has('Mesh')).toBe(false);
    expect(MD2_FEATURE_SCENE_REQUIREMENTS.has('Animation')).toBe(false);
  });
});
