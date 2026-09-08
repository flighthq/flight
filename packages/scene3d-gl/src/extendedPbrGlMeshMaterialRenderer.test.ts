import { createCamera3D, createPerspectiveProjection } from '@flighthq/camera/contract';
import {
  createAnisotropyPbrExtension,
  createClearcoatPbrExtension,
  createExtendedPbrMaterial,
} from '@flighthq/materials/contract';
import type { Camera3D, Scene3DLightBlock } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';

import { registerGlAnisotropyPbrExtension } from './anisotropyPbrGlExtension';
import { registerGlClearcoatPbrExtension } from './clearcoatPbrGlExtension';
import { extendedPbrGlMeshMaterialRenderer, registerGlExtendedPbrMaterial } from './extendedPbrGlMeshMaterialRenderer';
import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeCamera(): Camera3D {
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
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

  it('assembles and binds multiple punctual-and-IBL extension lobes in one program', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlAnisotropyPbrExtension(state);
    registerGlClearcoatPbrExtension(state);
    extendedPbrGlMeshMaterialRenderer.bind(
      state,
      createExtendedPbrMaterial({
        extensions: [
          createAnisotropyPbrExtension({ anisotropyRotation: 0.3, anisotropyStrength: 0.7 }),
          createClearcoatPbrExtension({ clearcoat: 0.8, clearcoatRoughness: 0.2 }),
        ],
      }),
      makeLights(),
      makeCamera(),
    );

    const shaderSources = gl.calls
      .filter((call) => call.name === 'shaderSource')
      .map((call) => call.args[1])
      .filter((source): source is string => typeof source === 'string');
    const fragmentSource = shaderSources.find((source) => source.includes('flightAnisotropySample'));
    expect(fragmentSource).toContain('flightVisibilitySmithGgxAnisotropic');
    expect(fragmentSource).toContain('flightClearcoatNormal');
    expect(fragmentSource).toContain('flightAnisotropyPrefiltered');
    expect(fragmentSource).toContain('flightClearcoatPrefiltered');
    expect(
      gl.calls.some(
        (call) =>
          call.name === 'uniform1f' &&
          (call.args[0] as { name?: string }).name === 'u_flightAnisotropyStrength' &&
          call.args[1] === 0.7,
      ),
    ).toBe(true);
    expect(
      gl.calls.some(
        (call) =>
          call.name === 'uniform1f' &&
          (call.args[0] as { name?: string }).name === 'u_flightClearcoat' &&
          call.args[1] === 0.8,
      ),
    ).toBe(true);
  });
});

describe('registerGlExtendedPbrMaterial', () => {
  it('registers the one generic material renderer', () => {
    const { state } = makeGlScene3DState();
    registerGlExtendedPbrMaterial(state);
    expect(getGlMeshMaterialRenderer(state, ExtendedPbrMaterialKind)).toBe(extendedPbrGlMeshMaterialRenderer);
  });
});
