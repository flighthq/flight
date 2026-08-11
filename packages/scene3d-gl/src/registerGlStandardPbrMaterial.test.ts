import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlStandardPbrMaterial } from './registerGlStandardPbrMaterial';
import { standardPbrGlMeshMaterialRenderer } from './standardPbrGlMeshMaterialRenderer';

describe('registerGlStandardPbrMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    expect(getGlMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(standardPbrGlMeshMaterialRenderer);
  });

  it('does not imply texture source registration', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    expect(getGlRenderStateRuntime(state).registries.textureResolvers.entries.size).toBe(0);
  });
});
