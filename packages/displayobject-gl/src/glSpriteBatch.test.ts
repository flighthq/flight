import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { Material } from '@flighthq/types';

import { defaultGlMaterialRenderer } from './glDefaultMaterial';
import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  flushGlSpriteBatch,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glSpriteBatch';
import { createGlState } from './glTestHelper';

function makeTexture(): HTMLImageElement {
  return document.createElement('img');
}

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

describe('bindGlQuadBatchBaseAttributes', () => {
  it('sets up the corner and base instance attribute pointers', () => {
    const { state, gl } = createGlState();
    ensureGlQuadBatchShader(state);
    bindGlQuadBatchBaseAttributes(state, 0);
    expect(gl.vertexAttribPointer).toHaveBeenCalled();
    expect(gl.vertexAttribDivisor).toHaveBeenCalled();
  });
});

describe('ensureGlQuadBatchShader', () => {
  it('returns a shader with a program and attribute locations', () => {
    const { state } = createGlState();
    const shader = ensureGlQuadBatchShader(state);
    expect(shader.program).toBeDefined();
    expect(typeof shader.locCorner).toBe('number');
    expect(shader.locWorldMatrix).toBeDefined();
    expect(shader.locTexture).toBeDefined();
  });

  it('is idempotent — returns the same shader on repeated calls', () => {
    const { state } = createGlState();
    const s1 = ensureGlQuadBatchShader(state);
    const s2 = ensureGlQuadBatchShader(state);
    expect(s1).toBe(s2);
  });
});

describe('flushGlSpriteBatch', () => {
  it('does nothing when batch count is zero', () => {
    const { state, gl } = createGlState();
    flushGlSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws when instances are pending and resets state', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    prepareGlSpriteBatchWrite(state, tex, null, null, defaultGlMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushGlSpriteBatch(state);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
    expect(runtime.spriteBatchCount).toBe(0);
    expect(runtime.spriteBatchTexture).toBeNull();
    expect(runtime.spriteBatchBlendMode).toBeNull();
    expect(runtime.spriteBatchMaterial).toBeNull();
  });
});

describe('packGlSpriteBatchMaterialInstance', () => {
  it('is a no-op when no per-instance material renderer is active', () => {
    const { state } = createGlState();
    getGlRenderStateRuntime(state).spriteBatchMaterialRenderer = null;
    expect(() => packGlSpriteBatchMaterialInstance(state, null, 0)).not.toThrow();
  });
});

describe('prepareGlSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', () => {
    const { state } = createGlState();
    const tex = makeTexture();

    const base = prepareGlSpriteBatchWrite(state, tex, null, null, defaultGlMaterialRenderer, 2);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareGlSpriteBatchWrite(state, tex1, null, null, defaultGlMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareGlSpriteBatchWrite(state, tex2, null, null, defaultGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchTexture).toBe(tex2);
  });

  it('flushes when material changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareGlSpriteBatchWrite(state, tex, null, materialA, defaultGlMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareGlSpriteBatchWrite(state, tex, null, materialB, defaultGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchMaterial).toBe(materialB);
  });

  it('grows instance data when capacity is exceeded', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const initialFloats = runtime.spriteBatchInstanceData.length;

    prepareGlSpriteBatchWrite(state, tex, null, null, defaultGlMaterialRenderer, initialFloats + 100);

    expect(runtime.spriteBatchInstanceData.length).toBeGreaterThan(initialFloats);
  });
});

describe('setGlQuadBatchWorldAndTexture', () => {
  it('uploads the world matrix and texture unit', () => {
    const { state, gl } = createGlState();
    setGlQuadBatchWorldAndTexture(state, {} as WebGLUniformLocation, {} as WebGLUniformLocation);
    expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    expect(gl.uniform1i).toHaveBeenCalled();
  });
});

describe('useGlQuadBatchProgram', () => {
  it('binds the program and records it as current', () => {
    const { state, gl } = createGlState();
    const program = {} as WebGLProgram;
    useGlQuadBatchProgram(state, program);
    expect(gl.useProgram).toHaveBeenCalledWith(program);
    expect(getGlRenderStateRuntime(state).currentProgram).toBe(program);
  });
});
