import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { glStandardPbrMeshMaterialRenderer } from './glStandardPbrMeshMaterialRenderer';
import { registerGlStandardPbrMaterial } from './registerGlStandardPbrMaterial';

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
