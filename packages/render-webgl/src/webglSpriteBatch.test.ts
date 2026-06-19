import type { Material } from '@flighthq/types';

import { defaultWebGLMaterialRenderer } from './webglDefaultMaterial';
import { getWebGLRenderStateRuntime } from './webglRenderState';
import {
  bindWebGLQuadBatchBaseAttributes,
  ensureWebGLQuadBatchShader,
  flushWebGLSpriteBatch,
  packWebGLSpriteBatchMaterialInstance,
  prepareWebGLSpriteBatchWrite,
  setWebGLQuadBatchWorldAndTexture,
  useWebGLQuadBatchProgram,
} from './webglSpriteBatch';
import { makeWebGLState } from './webglTestHelper';

function makeTexture(): HTMLImageElement {
  return document.createElement('img');
}

function makeMaterial(): Material {
  return { kind: Symbol('TestMaterial') } as Material;
}

describe('bindWebGLQuadBatchBaseAttributes', () => {
  it('sets up the corner and base instance attribute pointers', () => {
    const { state, gl } = makeWebGLState();
    ensureWebGLQuadBatchShader(state);
    bindWebGLQuadBatchBaseAttributes(state, 0);
    expect(gl.vertexAttribPointer).toHaveBeenCalled();
    expect(gl.vertexAttribDivisor).toHaveBeenCalled();
  });
});

describe('flushWebGLSpriteBatch', () => {
  it('does nothing when batch count is zero', () => {
    const { state, gl } = makeWebGLState();
    flushWebGLSpriteBatch(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws when instances are pending and resets state', () => {
    const { state, gl } = makeWebGLState();
    const runtime = getWebGLRenderStateRuntime(state);
    const tex = makeTexture();

    prepareWebGLSpriteBatchWrite(state, tex, null, null, defaultWebGLMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWebGLSpriteBatch(state);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
    expect(runtime.spriteBatchCount).toBe(0);
    expect(runtime.spriteBatchTexture).toBeNull();
    expect(runtime.spriteBatchBlendMode).toBeNull();
    expect(runtime.spriteBatchMaterial).toBeNull();
  });
});

describe('packWebGLSpriteBatchMaterialInstance', () => {
  it('is a no-op when no per-instance material renderer is active', () => {
    const { state } = makeWebGLState();
    getWebGLRenderStateRuntime(state).spriteBatchMaterialRenderer = null;
    expect(() => packWebGLSpriteBatchMaterialInstance(state, null, 0)).not.toThrow();
  });
});

describe('prepareWebGLSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', () => {
    const { state } = makeWebGLState();
    const tex = makeTexture();

    const base = prepareWebGLSpriteBatchWrite(state, tex, null, null, defaultWebGLMaterialRenderer, 2);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', () => {
    const { state, gl } = makeWebGLState();
    const runtime = getWebGLRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareWebGLSpriteBatchWrite(state, tex1, null, null, defaultWebGLMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareWebGLSpriteBatchWrite(state, tex2, null, null, defaultWebGLMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchTexture).toBe(tex2);
  });

  it('flushes when material changes', () => {
    const { state, gl } = makeWebGLState();
    const runtime = getWebGLRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWebGLSpriteBatchWrite(state, tex, null, materialA, defaultWebGLMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareWebGLSpriteBatchWrite(state, tex, null, materialB, defaultWebGLMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchMaterial).toBe(materialB);
  });

  it('grows instance data when capacity is exceeded', () => {
    const { state } = makeWebGLState();
    const runtime = getWebGLRenderStateRuntime(state);
    const tex = makeTexture();
    const initialFloats = runtime.spriteBatchInstanceData.length;

    prepareWebGLSpriteBatchWrite(state, tex, null, null, defaultWebGLMaterialRenderer, initialFloats + 100);

    expect(runtime.spriteBatchInstanceData.length).toBeGreaterThan(initialFloats);
  });
});

describe('setWebGLQuadBatchWorldAndTexture', () => {
  it('uploads the world matrix and texture unit', () => {
    const { state, gl } = makeWebGLState();
    setWebGLQuadBatchWorldAndTexture(state, {} as WebGLUniformLocation, {} as WebGLUniformLocation);
    expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    expect(gl.uniform1i).toHaveBeenCalled();
  });
});

describe('useWebGLQuadBatchProgram', () => {
  it('binds the program and records it as current', () => {
    const { state, gl } = makeWebGLState();
    const program = {} as WebGLProgram;
    useWebGLQuadBatchProgram(state, program);
    expect(gl.useProgram).toHaveBeenCalledWith(program);
    expect(getWebGLRenderStateRuntime(state).currentProgram).toBe(program);
  });
});
