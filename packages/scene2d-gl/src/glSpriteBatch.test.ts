import { createImageResource } from '@flighthq/image';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ColorScaleBias, ImageResource, Material } from '@flighthq/types';

import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  flushGlSpriteBatch,
  packGlSpriteBatchMaterialInstance,
  prepareGlSpriteBatchWrite,
  recordGlSpriteBatchColorScaleBias,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glSpriteBatch';
import { standardGlMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeTexture(): ImageResource {
  return createImageResource(document.createElement('img'));
}

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

function ct(
  redScale = 1,
  greenScale = 1,
  blueScale = 1,
  alphaScale = 1,
  redBias = 0,
  greenBias = 0,
  blueBias = 0,
  alphaBias = 0,
): ColorScaleBias {
  return {
    redScale,
    greenScale,
    blueScale,
    alphaScale,
    redBias,
    greenBias,
    blueBias,
    alphaBias,
  } as ColorScaleBias;
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

    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1);
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

    const base = prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 2);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareGlSpriteBatchWrite(state, tex1, null, null, standardGlMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareGlSpriteBatchWrite(state, tex2, null, null, standardGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchTexture).toBe(tex2);
  });

  it('flushes when material changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareGlSpriteBatchWrite(state, tex, null, materialA, standardGlMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;

    prepareGlSpriteBatchWrite(state, tex, null, materialB, standardGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchMaterial).toBe(materialB);
  });

  it('grows instance data when capacity is exceeded', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const initialFloats = runtime.spriteBatchInstanceData.length;

    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, initialFloats + 100);

    expect(runtime.spriteBatchInstanceData.length).toBeGreaterThan(initialFloats);
  });

  it('flushes when per-bitmap smoothing changes on the same texture', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    // Same texture/blend/material, but a NEAREST bitmap must not share a bind with a LINEAR one.
    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, false);
    runtime.spriteBatchCount = 1;

    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.spriteBatchSmoothing).toBe(true);
  });

  it('keeps same-smoothing bitmaps in one batch (no spurious flush)', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);
    runtime.spriteBatchCount = 1;
    prepareGlSpriteBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);

    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });
});

describe('recordGlSpriteBatchColorScaleBias', () => {
  it('skips the tint (draws untinted) and records no fold state when color adjustment is not enabled', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, standardGlMaterialRenderer, 1);
    recordGlSpriteBatchColorScaleBias(state, ct(0.5), 0);
    runtime.spriteBatchCount = 1;
    // No fold installed → the CT mode stays uninitialized and no CT program is bound.
    expect(runtime.spriteBatchColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
    flushGlSpriteBatch(state);
    expect(gl.uniform4f).not.toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('is a no-op for an untinted instance whether or not the fold is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(() => recordGlSpriteBatchColorScaleBias(state, null, 0)).not.toThrow();
    expect(runtime.spriteBatchColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
  });

  it('delegates to the installed fold when color adjustment is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlSpriteBatchColorScaleBias(state, ct(0.5), 0);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
  });
});

describe('setGlQuadBatchWorldAndTexture', () => {
  it('uploads the world matrix and texture unit', () => {
    const { state, gl } = createGlState();
    setGlQuadBatchWorldAndTexture(state, {} as WebGLUniformLocation, {} as WebGLUniformLocation);
    expect(gl.uniformMatrix3fv).toHaveBeenCalled();
    expect(gl.uniform1i).toHaveBeenCalled();
  });

  it('uploads the currently bound compressed texture alpha representation', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const straightAlphaLocation = {} as WebGLUniformLocation;
    runtime.currentTextureStraightAlpha = true;

    setGlQuadBatchWorldAndTexture(state, {} as WebGLUniformLocation, {} as WebGLUniformLocation, straightAlphaLocation);

    expect(gl.uniform1i).toHaveBeenCalledWith(straightAlphaLocation, 1);
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
