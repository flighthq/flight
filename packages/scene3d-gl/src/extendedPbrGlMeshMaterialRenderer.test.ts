import { createCamera3D } from '@flighthq/camera/contract';
import { createExtendedPbrMaterial } from '@flighthq/materials/contract';
import type { Camera3D, Scene3DLightBlock } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';

import { extendedPbrGlMeshMaterialRenderer, registerExtendedPbrGlMaterial } from './extendedPbrGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): Scene3DLightBlock {
  return {
    ambientCount: 0,
    data: new Float32Array(12),
    directionalCount: 0,
    hemisphereCount: 0,
    pointCount: 0,
    spotCount: 0,
    version: 1,
  };
}

describe('extendedPbrGlMeshMaterialRenderer', () => {
  it('binds the lean no-extension variant', () => {
    const { state, gl } = makeGlScene3DState();
    extendedPbrGlMeshMaterialRenderer.bind(state, createExtendedPbrMaterial(), makeLights(), makeCamera());
    expect(gl.calls.some((call) => call.name === 'useProgram')).toBe(true);
  });
});

describe('registerExtendedPbrGlMaterial', () => {
  it('registers the one generic material renderer', () => {
    const { state } = makeGlScene3DState();
    registerExtendedPbrGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, ExtendedPbrMaterialKind)).toBe(extendedPbrGlMeshMaterialRenderer);
  });
});
