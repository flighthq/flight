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
    locModel: loc('u_model'),
    locNormalMatrix: loc('u_normalMatrix'),
    locViewProjection: loc('u_viewProjection'),
    program: {} as WebGLProgram,
  };
}

describe('bindGlMeshLightBlock', () => {
  it('uploads the directional, ambient, and count uniforms from the packed block', () => {
    const gl = makeFakeGl2();
    const data = new Float32Array(12);
    data[0] = 0;
    data[1] = -1;
    data[4] = 1;
    data[5] = 1;
    data[6] = 1;
    data[8] = 0.2;
    bindGlMeshLightBlock(gl, makeLitProgram(), { ambientCount: 1, data, directionalCount: 1, version: 1 });
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBe(2);
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBe(1);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBe(2);
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
    ]) {
      expect(GL_MESH_LIGHT_BLOCK_GLSL).toContain(name);
    }
  });
});

describe('resolveGlLitLocations', () => {
  it('resolves the six standard lit uniform locations', () => {
    const gl = makeFakeGl2();
    const locations = resolveGlLitLocations(gl, {} as WebGLProgram);
    expect(locations.locDirectional).not.toBeNull();
    expect(locations.locAmbientRadiance).not.toBeNull();
    expect(locations.locCameraPosition).not.toBeNull();
  });
});
