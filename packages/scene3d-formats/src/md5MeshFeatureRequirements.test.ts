import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { MD5_MESH_FEATURE_SCENE_REQUIREMENTS } from './md5MeshFeatureRequirements.ts';

describe('MD5_MESH_FEATURE_SCENE_REQUIREMENTS', () => {
  it('maps Material to BlinnPhong', () => {
    expect(MD5_MESH_FEATURE_SCENE_REQUIREMENTS.get('Material')).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('does not map non-material features', () => {
    expect(MD5_MESH_FEATURE_SCENE_REQUIREMENTS.has('Mesh')).toBe(false);
    expect(MD5_MESH_FEATURE_SCENE_REQUIREMENTS.has('Skeleton')).toBe(false);
  });
});
