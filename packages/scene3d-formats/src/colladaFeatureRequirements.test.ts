import { RequirementFacet, StandardPbrMaterialKind } from '@flighthq/types/contract';

import { COLLADA_FEATURE_SCENE_REQUIREMENTS } from './colladaFeatureRequirements.ts';

describe('COLLADA_FEATURE_SCENE_REQUIREMENTS', () => {
  it('maps Material to StandardPbr', () => {
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.get('Material')).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('maps each effect shading model to StandardPbr', () => {
    for (const feature of ['Effect.Blinn', 'Effect.Lambert', 'Effect.Phong']) {
      expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.get(feature), feature).toContainEqual({
        facet: RequirementFacet.SceneMaterialKind,
        key: StandardPbrMaterialKind,
      });
    }
  });

  it('does not map non-material features', () => {
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.has('Geometry')).toBe(false);
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.has('Camera')).toBe(false);
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.has('Light')).toBe(false);
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.has('Animation')).toBe(false);
    expect(COLLADA_FEATURE_SCENE_REQUIREMENTS.has('Controller')).toBe(false);
  });
});
