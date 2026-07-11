import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ColorTransform, Material } from '@flighthq/types';

import { enableGlColorAdjustment } from './glColorAdjustment';
import { defaultGlMaterialRenderer } from './glDefaultMaterial';
import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  flushGlSpriteBatch,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  recordGlSpriteBatchColorTransform,
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

function ct(
  redMultiplier = 1,
  greenMultiplier = 1,
  blueMultiplier = 1,
  alphaMultiplier = 1,
  redOffset = 0,
  greenOffset = 0,
  blueOffset = 0,
  alphaOffset = 0,
): ColorTransform {
  return {
    redMultiplier,
    greenMultiplier,
    blueMultiplier,
    alphaMultiplier,
    redOffset,
    greenOffset,
    blueOffset,
    alphaOffset,
  } as ColorTransform;
}

const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;

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

describe('recordGlSpriteBatchColorTransform', () => {
  it('skips the tint (draws untinted) and records no fold state when color adjustment is not enabled', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 1);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    runtime.spriteBatchCount = 1;
    // No fold installed → the CT mode stays uninitialized and no CT program is bound.
    expect(runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
    flushGlSpriteBatch(state);
    expect(gl.uniform4f).not.toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('is a no-op for an untinted instance whether or not the fold is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(() => recordGlSpriteBatchColorTransform(state, null, 0)).not.toThrow();
    expect(runtime.spriteBatchColorTransformMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
  });

  it('delegates to the installed fold when color adjustment is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
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
