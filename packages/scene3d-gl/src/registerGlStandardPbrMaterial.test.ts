import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry.ts';
import { makeGlScene3DState } from './glScene3DTestHelper.ts';
import { glStandardPbrMeshMaterialRenderer } from './glStandardPbrMeshMaterialRenderer.ts';
import { registerGlStandardPbrMaterial } from './registerGlStandardPbrMaterial.ts';

describe('registerGlStandardPbrMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    expect(getGlMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(glStandardPbrMeshMaterialRenderer);
  });

  it('does not imply texture source registration', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    expect(getGlRenderStateRuntime(state).registries.textureResolvers.size).toBe(0);
  });
});
