import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';
import { standardPbrGlMeshMaterialRenderer } from './standardPbrGlMeshMaterialRenderer';

describe('registerStandardPbrGlMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerStandardPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(standardPbrGlMeshMaterialRenderer);
  });
});
