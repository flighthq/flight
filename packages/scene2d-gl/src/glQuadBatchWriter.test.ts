import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { BlendMode, ColorScaleBias, GlMaterialRenderer, GlRenderState, Material } from '@flighthq/types/contract';

import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import {
  bindGlQuadBatchBaseAttributes,
  ensureGlQuadBatchShader,
  flushGlQuadBatchWriter,
  packGlQuadBatchMaterialInstance,
  prepareGlQuadBatchWrite as prepareResolvedGlQuadBatchWrite,
  recordGlQuadBatchColorScaleBias,
  setGlQuadBatchWorldAndTexture,
  useGlQuadBatchProgram,
} from './glQuadBatchWriter';
import { standardGlMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeTexture(): WebGLTexture {
  return {} as WebGLTexture;
}

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

function prepareGlQuadBatchWrite(
  state: GlRenderState,
  texture: WebGLTexture,
  blendMode: BlendMode | null,
  material: Material | null,
  materialRenderer: GlMaterialRenderer,
  maxInstances: number,
  smoothing: boolean | null = null,
): number {
  return prepareResolvedGlQuadBatchWrite(
    state,
    texture,
    false,
    null,
    blendMode,
    material,
    materialRenderer,
    maxInstances,
    smoothing,
  );
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

describe('flushGlQuadBatchWriter', () => {
  it('does nothing when batch count is zero', () => {
    const { state, gl } = createGlState();
    flushGlQuadBatchWriter(state);
    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });

  it('draws when instances are pending and resets state', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushGlQuadBatchWriter(state);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 1);
    expect(runtime.quadBatchWriterCount).toBe(0);
    expect(runtime.quadBatchWriterTexture).toBeNull();
    expect(runtime.quadBatchWriterBlendMode).toBeNull();
    expect(runtime.quadBatchWriterMaterial).toBeNull();
  });
});

describe('packGlQuadBatchMaterialInstance', () => {
  it('is a no-op when no per-instance material renderer is active', () => {
    const { state } = createGlState();
    getGlRenderStateRuntime(state).quadBatchWriterMaterialRenderer = null;
    expect(() => packGlQuadBatchMaterialInstance(state, null, 0)).not.toThrow();
  });
});

describe('prepareGlQuadBatchWrite', () => {
  it('installs the pending-draw flush seam on the render state runtime', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);

    expect(runtime.flushPendingDraws).toBeNull();
    prepareGlQuadBatchWrite(state, makeTexture(), null, null, standardGlMaterialRenderer, 1);

    expect(runtime.flushPendingDraws).toBe(flushGlQuadBatchWriter);
  });

  it('returns instance index 0 for an empty batch', () => {
    const { state } = createGlState();
    const tex = makeTexture();

    const base = prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 2);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareGlQuadBatchWrite(state, tex1, null, null, standardGlMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;

    prepareGlQuadBatchWrite(state, tex2, null, null, standardGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.quadBatchWriterTexture).toBe(tex2);
  });

  it('flushes when material changes', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareGlQuadBatchWrite(state, tex, null, materialA, standardGlMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;

    prepareGlQuadBatchWrite(state, tex, null, materialB, standardGlMaterialRenderer, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.quadBatchWriterMaterial).toBe(materialB);
  });

  it('grows instance data when capacity is exceeded', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();
    const initialFloats = runtime.quadBatchWriterInstanceData.length;

    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, initialFloats + 100);

    expect(runtime.quadBatchWriterInstanceData.length).toBeGreaterThan(initialFloats);
  });

  it('flushes when per-bitmap smoothing changes on the same texture', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    // Same texture/blend/material, but a NEAREST bitmap must not share a bind with a LINEAR one.
    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, false);
    runtime.quadBatchWriterCount = 1;

    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);

    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(1);
    expect(runtime.quadBatchWriterSmoothing).toBe(true);
  });

  it('keeps same-smoothing bitmaps in one batch (no spurious flush)', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const tex = makeTexture();

    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);
    runtime.quadBatchWriterCount = 1;
    prepareGlQuadBatchWrite(state, tex, null, null, standardGlMaterialRenderer, 1, true);

    expect(gl.drawElementsInstanced).not.toHaveBeenCalled();
  });
});

describe('recordGlQuadBatchColorScaleBias', () => {
  it('skips the tint (draws untinted) and records no fold state when color adjustment is not enabled', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    prepareGlQuadBatchWrite(state, makeTexture(), null, null, standardGlMaterialRenderer, 1);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    runtime.quadBatchWriterCount = 1;
    // No fold installed → the CT mode stays uninitialized and no CT program is bound.
    expect(runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
    flushGlQuadBatchWriter(state);
    expect(gl.uniform4f).not.toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('is a no-op for an untinted instance whether or not the fold is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(() => recordGlQuadBatchColorScaleBias(state, null, 0)).not.toThrow();
    expect(runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
  });

  it('delegates to the installed fold when color adjustment is enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
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
    runtime.context.currentTextureRealization = { straightAlpha: true, texture: state.gl.createTexture()! };

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
    expect(getGlRenderStateRuntime(state).context.currentShader?.program).toBe(program);
  });
});
