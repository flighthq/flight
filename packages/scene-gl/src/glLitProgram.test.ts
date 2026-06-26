import type { GlRenderState } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

import type { GlLitProgram } from './glLitProgram';
import { bindGlMeshLightBlock, GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { makeFakeGl2 } from './glSceneTestHelper';

function makeLitProgram(): GlLitProgram {
  const loc = (name: string): WebGLUniformLocation => ({ name }) as WebGLUniformLocation;
  return {
    locAmbientCount: loc('u_ambientCount'),
    locAmbientRadiance: loc('u_ambientRadiance'),
    locCameraPosition: loc('u_cameraPosition'),
    locDirectional: loc('u_directional'),
    locDirectionalCount: loc('u_directionalCount'),
    locDirectionalRadiance: loc('u_directionalRadiance'),
    locIblBrdf: loc('u_iblBrdf'),
    locIblEnabled: loc('u_iblEnabled'),
    locIblIntensity: loc('u_iblIntensity'),
    locIblIrradiance: loc('u_iblIrradiance'),
    locIblMaxMip: loc('u_iblMaxMip'),
    locIblPrefiltered: loc('u_iblPrefiltered'),
    locModel: loc('u_model'),
    locNormalMatrix: loc('u_normalMatrix'),
    locShadowEnabled: loc('u_shadowEnabled'),
    locShadowMap: loc('u_shadowMap'),
    locShadowMatrix: loc('u_shadowMatrix'),
    locViewProjection: loc('u_viewProjection'),
    program: {} as WebGLProgram,
  };
}

function makeState(gl: ReturnType<typeof makeFakeGl2>): GlRenderState {
  return { [EntityRuntimeKey]: {}, gl } as unknown as GlRenderState;
}

describe('bindGlMeshLightBlock', () => {
  it('uploads the directional, ambient, count, shadow-gate, and ibl-gate uniforms from the packed block', () => {
    const gl = makeFakeGl2();
    const data = new Float32Array(12);
    data[0] = 0;
    data[1] = -1;
    data[4] = 1;
    data[5] = 1;
    data[6] = 1;
    data[8] = 0.2;
    bindGlMeshLightBlock(makeState(gl), makeLitProgram(), {
      ambientCount: 1,
      data,
      directionalCount: 1,
      hemisphereCount: 0,
      pointCount: 0,
      spotCount: 0,
      version: 1,
    });
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBe(2);
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBe(1);
    // directionalCount + ambientCount + shadowEnabled (0, no active shadow) + iblEnabled (0, no IBL).
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBe(4);
  });
});

describe('GL_MESH_LIGHT_BLOCK_GLSL', () => {
  it('declares every uniform the CPU upload sets', () => {
    for (const name of [
      'u_directional',
      'u_directionalRadiance',
      'u_ambientRadiance',
      'u_directionalCount',
      'u_ambientCount',
      'u_cameraPosition',
      'u_shadowMap',
      'u_shadowMatrix',
      'u_shadowEnabled',
    ]) {
      expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain(name);
    }
  });
});

describe('resolveGlLitLocations', () => {
  it('resolves the standard lit uniform locations', () => {
    const gl = makeFakeGl2();
    const locations = resolveGlLitLocations(gl, {} as WebGLProgram);
    expect(locations.locDirectional).not.toBeNull();
    expect(locations.locAmbientRadiance).not.toBeNull();
    expect(locations.locCameraPosition).not.toBeNull();
    expect(locations.locShadowMap).not.toBeNull();
  });
});
