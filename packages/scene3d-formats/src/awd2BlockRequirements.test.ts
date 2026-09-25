import { RequirementFacet, ShadedMaterialKind } from '@flighthq/types/contract';

import { AWD2_BLOCK_SCENE_REQUIREMENTS } from './awd2BlockRequirements.ts';

describe('AWD2_BLOCK_SCENE_REQUIREMENTS', () => {
  it('maps Material to ShadedMaterial', () => {
    const material = AWD2_BLOCK_SCENE_REQUIREMENTS.get('Material');
    expect(material).toBeDefined();
    expect(material).toContainEqual({ facet: RequirementFacet.SceneMaterialKind, key: ShadedMaterialKind });
  });

  it('uses block names that getAwd2BlockName returns', () => {
    for (const name of AWD2_BLOCK_SCENE_REQUIREMENTS.keys()) {
      expect(name).toMatch(/^[A-Z][a-zA-Z]+$/);
    }
  });
});
