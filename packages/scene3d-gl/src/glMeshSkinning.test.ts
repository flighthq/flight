import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import type { GlMeshProgram } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { SKIN_PALETTE_TEXTURE_UNIT } from './glMeshProgram';
import {
  bindGlMeshSkinPalette,
  bindGlShadowSkinPalette,
  getGlMeshSkinFeature,
  registerGlMeshSkinning,
  GL_SKIN_VERTEX_DECLARATIONS_GLSL,
} from './glMeshSkinning';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

function makeProgram(): GlMeshProgram {
  return {
    locModel: { name: 'u_model' } as WebGLUniformLocation,
    locNormalMatrix: { name: 'u_normalMatrix' } as WebGLUniformLocation,
    locViewProjection: { name: 'u_viewProjection' } as WebGLUniformLocation,
    program: {} as WebGLProgram,
  };
}

function makeSkinnedProxy() {
  return {
    jointMatrices: new Float32Array(16),
    material: createStandardPbrMaterial(),
    normalMatrix: createMatrix3(),
    subset: createBoxMeshGeometry().subsets[0]!,
    worldMatrix: createMatrix4(),
  };
}

describe('bindGlMeshSkinPalette', () => {
  it('reports a GPU-skinned draw after binding its pose palette', () => {
    const { state, gl } = makeGlScene3DState();
    const program = makeProgram();
    program.locJointTexture = { name: 'u_jointTexture' } as WebGLUniformLocation;

    const gpuSkinned = bindGlMeshSkinPalette(state, program, makeSkinnedProxy());

    expect(gpuSkinned).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1i' && c.args[1] === SKIN_PALETTE_TEXTURE_UNIT)).toBe(true);
  });

  it('reports not skinned when the program carries no joint texture', () => {
    const { state } = makeGlScene3DState();
    expect(bindGlMeshSkinPalette(state, makeProgram(), makeSkinnedProxy())).toBe(false);
  });
});

describe('bindGlShadowSkinPalette', () => {
  it('uploads the pose palette on the skin palette unit', () => {
    const { state, gl } = makeGlScene3DState();
    bindGlShadowSkinPalette(state, new Float32Array(16));
    expect(
      gl.calls.some((c) => c.name === 'activeTexture' && c.args[0] === gl.TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT),
    ).toBe(true);
  });
});

describe('getGlMeshSkinFeature', () => {
  it('returns null before registration, so every consumer stays on the rigid path', () => {
    const { state } = makeGlScene3DState();
    expect(getGlMeshSkinFeature(state)).toBeNull();
  });

  it('returns the capability once registered', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshSkinning(state);
    expect(getGlMeshSkinFeature(state)).not.toBeNull();
  });
});

describe('GL_SKIN_VERTEX_DECLARATIONS_GLSL', () => {
  it('declares the influence attributes and the palette fetch the HAS_SKIN body calls', () => {
    expect(GL_SKIN_VERTEX_DECLARATIONS_GLSL).toContain('a_joints0');
    expect(GL_SKIN_VERTEX_DECLARATIONS_GLSL).toContain('a_weights0');
    expect(GL_SKIN_VERTEX_DECLARATIONS_GLSL).toContain('mat4 skinMatrix()');
  });

  it('declares no fragment-stage output, since it is spliced into vertex sources only', () => {
    // Its `in` attributes are illegal in a fragment shader, so a fragment splice would fail to compile.
    expect(GL_SKIN_VERTEX_DECLARATIONS_GLSL).not.toContain('out vec4 fragColor');
  });
});

describe('registerGlMeshSkinning', () => {
  it('installs a capability carrying both the binders and the vertex GLSL', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshSkinning(state);
    const feature = getGlScene3DRuntime(state).meshSkinFeature;
    expect(feature?.bindMeshSkinPalette).toBe(bindGlMeshSkinPalette);
    expect(feature?.bindShadowSkinPalette).toBe(bindGlShadowSkinPalette);
    expect(feature?.vertexDeclarationsGlsl).toBe(GL_SKIN_VERTEX_DECLARATIONS_GLSL);
  });

  it('is idempotent, so registering twice leaves one working capability', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshSkinning(state);
    registerGlMeshSkinning(state);
    expect(getGlMeshSkinFeature(state)?.vertexDeclarationsGlsl).toBe(GL_SKIN_VERTEX_DECLARATIONS_GLSL);
  });
});
