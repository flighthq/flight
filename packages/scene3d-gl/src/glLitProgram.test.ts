import { createMatrix4 } from '@flighthq/geometry/contract';
import type { GlRenderState, GlLitProgram } from '@flighthq/types/contract';
import { EntityRuntimeKey, SCENE_LIGHT_BLOCK_FLOATS } from '@flighthq/types/contract';

import { bindGlMeshLightBlock, GL_MESH_LIGHT_BLOCK_GLSL, resolveGlLitLocations } from './glLitProgram';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2 } from './glScene3DTestHelper';

function makeLitProgram(): GlLitProgram {
  const loc = (name: string): WebGLUniformLocation => ({ name }) as WebGLUniformLocation;
  return {
    locAmbientCount: loc('u_ambientCount'),
    locAmbientRadiance: loc('u_ambientRadiance'),
    locCameraPosition: loc('u_cameraPosition'),
    locDirectional: loc('u_directional'),
    locDirectionalCount: loc('u_directionalCount'),
    locDirectionalRadiance: loc('u_directionalRadiance'),
    locHemisphereCount: loc('u_hemisphereCount'),
    locHemisphereLights: loc('u_hemisphereLights'),
    locIblBrdf: loc('u_iblBrdf'),
    locIblEnabled: loc('u_iblEnabled'),
    locIblIntensity: loc('u_iblIntensity'),
    locIblIrradiance: loc('u_iblIrradiance'),
    locIblMaxMip: loc('u_iblMaxMip'),
    locIblPrefiltered: loc('u_iblPrefiltered'),
    locModel: loc('u_model'),
    locNormalMatrix: loc('u_normalMatrix'),
    locPointCount: loc('u_pointCount'),
    locPointLights: loc('u_pointLights'),
    locShadowBias: loc('u_shadowBias'),
    locShadowEnabled: loc('u_shadowEnabled'),
    locShadowMap: loc('u_shadowMap'),
    locShadowMatrix: loc('u_shadowMatrix'),
    locShadowNormalBias: loc('u_shadowNormalBias'),
    locShadowPcfRadius: loc('u_shadowPcfRadius'),
    locSpotCount: loc('u_spotCount'),
    locSpotLights: loc('u_spotLights'),
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
    const data = new Float32Array(SCENE_LIGHT_BLOCK_FLOATS);
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

  it('skips the light uniform upload when the program already holds the block version', () => {
    const gl = makeFakeGl2();
    const program = makeLitProgram();
    const state = makeState(gl);
    const block = {
      ambientCount: 1,
      data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
      directionalCount: 1,
      hemisphereCount: 0,
      pointCount: 0,
      spotCount: 0,
      version: 7,
    };
    bindGlMeshLightBlock(state, program, block);
    bindGlMeshLightBlock(state, program, block);
    // Two binds, one program, one version: locDirectional/locDirectionalRadiance (uniform4f) and
    // locAmbientRadiance (uniform3f) upload exactly once — only the light block is gated.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBe(2);
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBe(1);
  });

  it('re-uploads the light uniforms when the block version changes', () => {
    const gl = makeFakeGl2();
    const program = makeLitProgram();
    const state = makeState(gl);
    const data = new Float32Array(SCENE_LIGHT_BLOCK_FLOATS);
    const block = { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0 };
    bindGlMeshLightBlock(state, program, { ...block, version: 1 });
    bindGlMeshLightBlock(state, program, { ...block, version: 2 });
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBe(4);
  });

  it('re-uploads when a different per-object block has the same version', () => {
    const gl = makeFakeGl2();
    const program = makeLitProgram();
    const state = makeState(gl);
    const common = {
      ambientCount: 0,
      directionalCount: 0,
      hemisphereCount: 0,
      pointCount: 1,
      spotCount: 0,
      version: 1,
    };
    bindGlMeshLightBlock(state, program, { ...common, data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS) });
    bindGlMeshLightBlock(state, program, { ...common, data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS) });
    expect(gl.calls.filter((c) => c.name === 'uniform4f')).toHaveLength(4);
  });

  it('uploads the punctual light arrays and their int counts from the packed block', () => {
    const gl = makeFakeGl2();
    bindGlMeshLightBlock(makeState(gl), makeLitProgram(), {
      ambientCount: 0,
      data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
      directionalCount: 0,
      hemisphereCount: 3,
      pointCount: 2,
      spotCount: 1,
      version: 1,
    });
    // Three vec4 arrays uploaded: point, spot, hemisphere.
    const arrayUploads = gl.calls.filter((c) => c.name === 'uniform4fv');
    expect(arrayUploads.length).toBe(3);
    // Each count uploads as an int uniform (u_pointCount / u_spotCount / u_hemisphereCount).
    const intUploads = gl.calls.filter(
      (c) =>
        c.name === 'uniform1i' &&
        typeof (c.args[0] as { name?: string })?.name === 'string' &&
        (c.args[0] as { name: string }).name.endsWith('Count'),
    );
    expect(intUploads.map((c) => (c.args[0] as { name: string }).name).sort()).toEqual([
      'u_hemisphereCount',
      'u_pointCount',
      'u_spotCount',
    ]);
    expect(intUploads.find((c) => (c.args[0] as { name: string }).name === 'u_pointCount')?.args[1]).toBe(2);
    expect(intUploads.find((c) => (c.args[0] as { name: string }).name === 'u_spotCount')?.args[1]).toBe(1);
    expect(intUploads.find((c) => (c.args[0] as { name: string }).name === 'u_hemisphereCount')?.args[1]).toBe(3);
  });

  it('uploads the active directional shadow filter and bias configuration', () => {
    const gl = makeFakeGl2();
    const state = makeState(gl);
    const runtime = getGlScene3DRuntime(state);
    runtime.shadow = {
      enabled: true,
      matrix: createMatrix4(),
      normalBias: 0.02,
      pcfRadius: 3,
      shadowBias: 0.01,
      texture: {} as WebGLTexture,
    };

    bindGlMeshLightBlock(state, makeLitProgram(), {
      ambientCount: 0,
      data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
      directionalCount: 1,
      hemisphereCount: 0,
      pointCount: 0,
      spotCount: 0,
      version: 1,
    });

    const scalar = (name: string) =>
      gl.calls.find(
        (call) =>
          (call.name === 'uniform1f' || call.name === 'uniform1i') &&
          (call.args[0] as { name?: string })?.name === name,
      )?.args[1];
    expect(scalar('u_shadowEnabled')).toBe(1);
    expect(scalar('u_shadowPcfRadius')).toBe(3);
    expect(scalar('u_shadowBias')).toBe(0.01);
    expect(scalar('u_shadowNormalBias')).toBe(0.02);
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
      'u_shadowPcfRadius',
      'u_shadowBias',
      'u_shadowNormalBias',
      'u_pointLights',
      'u_spotLights',
      'u_hemisphereLights',
      'u_pointCount',
      'u_spotCount',
      'u_hemisphereCount',
    ]) {
      expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain(name);
    }
  });

  it('uses a bounded runtime PCF radius and configurable receiver biases', () => {
    expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain('sampleDirectionalShadow(vec3 worldPos, vec3 geometricNormal)');
    expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain('geometricNormal * u_shadowNormalBias');
    expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain('uvz.z - u_shadowBias');
    expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain('abs(x) > u_shadowPcfRadius');
    expect(GL_MESH_LIGHT_BLOCK_GLSL).not.toContain('0.0025');
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
    expect(locations.locShadowPcfRadius).not.toBeNull();
    expect(locations.locShadowBias).not.toBeNull();
    expect(locations.locShadowNormalBias).not.toBeNull();
  });
});
