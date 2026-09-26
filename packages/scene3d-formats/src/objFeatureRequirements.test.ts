import {
  BlinnPhongMaterialKind,
  OBJ_MATERIAL_BLINN_PHONG_FEATURE,
  OBJ_MATERIAL_STANDARD_PBR_FEATURE,
  RequirementFacet,
  StandardPbrMaterialKind,
} from '@flighthq/types/contract';

import { OBJ_FEATURE_SCENE_REQUIREMENTS } from './objFeatureRequirements.ts';

describe('OBJ_FEATURE_SCENE_REQUIREMENTS', () => {
  // ★ EACH MODEL IMPLIES ONLY ITS OWN RENDERER. This table used to key on one coarse `Material` feature and
  // name BOTH material kinds, because the analyzer could not see the MTL — so a classic-MTL model dragged the
  // StandardPbr renderer in. The MTL is read now, so the mapping is one model to one renderer, and the test
  // asserts the exclusion as well as the inclusion: that is where the precision actually lives.
  it('maps each shading model to its own renderer and not the other', () => {
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.get(OBJ_MATERIAL_BLINN_PHONG_FEATURE)).toEqual([
      { facet: RequirementFacet.SceneMaterialKind, key: BlinnPhongMaterialKind },
    ]);
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.get(OBJ_MATERIAL_STANDARD_PBR_FEATURE)).toEqual([
      { facet: RequirementFacet.SceneMaterialKind, key: StandardPbrMaterialKind },
    ]);
  });

  // The coarse name is not a key here at all: it says the file references materials, which answers neither
  // "which renderer" nor "which parser handler". `parseObjRequirements` replaces it before it reaches a row.
  it('does not map the coarse Material feature, which names no shading model', () => {
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Material')).toBe(false);
  });

  it('does not map non-material features', () => {
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Face')).toBe(false);
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Line')).toBe(false);
    expect(OBJ_FEATURE_SCENE_REQUIREMENTS.has('Point')).toBe(false);
  });
});
