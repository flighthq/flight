import { BlinnPhongMaterialKind, RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

import { OBJ_FEATURE_SCENE_REQUIREMENTS } from './objFeatureRequirements.ts';

describe('OBJ_FEATURE_SCENE_REQUIREMENTS', () => {
  it('maps Material to both BlinnPhong and StandardPbr', () => {
    const requirements = OBJ_FEATURE_SCENE_REQUIREMENTS.get('Material');
    expect(requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
    expect(requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('does not map non-material features', () => {
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Face')).toBe(false);
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Line')).toBe(false);
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Point')).toBe(false);
  });
});
