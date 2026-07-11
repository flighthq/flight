import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ColorTransform, Material } from '@flighthq/types';

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
const CT_MODE_PER_INSTANCE = 2;

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
  it('stays untinted (mode NONE) when no instance carries a color transform', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, null, 0);
    recordGlSpriteBatchColorTransform(state, null, 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_NONE);
  });

  it('uses one whole-batch uniform when every instance shares one tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tint = ct(0.5);
    recordGlSpriteBatchColorTransform(state, tint, 0);
    recordGlSpriteBatchColorTransform(state, tint, 1);
    recordGlSpriteBatchColorTransform(state, tint, 2);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.spriteBatchUniformColorTransform).toBe(tint);
  });

  it('keeps the uniform path for a distinct-but-equal tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
  });

  it('promotes to per-instance (never splits) when tints diverge, back-filling the earlier tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData[0]).toBe(0.5);
    expect(runtime.spriteBatchColorTransformData[8]).toBe(0.25);
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, null, 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData[0]).toBe(1);
    expect(runtime.spriteBatchColorTransformData[8]).toBe(0.5);
  });

  it('writes identity for an untinted instance once the batch is per-instance', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    recordGlSpriteBatchColorTransform(state, null, 2);
    expect(runtime.spriteBatchColorTransformData[16]).toBe(1);
    expect(runtime.spriteBatchColorTransformData[20]).toBe(0);
  });

  it('normalizes color offsets by 255', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    recordGlSpriteBatchColorTransform(state, ct(1, 1, 1, 1, 255, 0, 0, 0), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformData[4]).toBe(1);
  });

  it('drives the uniform color-transform shader on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 1);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    runtime.spriteBatchCount = 1;
    flushGlSpriteBatch(state);
    expect(gl.uniform4f).toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('uploads a per-instance color-transform buffer on flush when tints vary', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 2);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    runtime.spriteBatchCount = 2;
    flushGlSpriteBatch(state);
    expect(runtime.spriteBatchColorTransformBuffer).not.toBeNull();
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('leaves the lean base shader untouched for an untinted batch on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 1);
    recordGlSpriteBatchColorTransform(state, null, 0);
    runtime.spriteBatchCount = 1;
    flushGlSpriteBatch(state);
    expect(runtime.spriteBatchColorTransformBuffer).toBeNull();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
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
