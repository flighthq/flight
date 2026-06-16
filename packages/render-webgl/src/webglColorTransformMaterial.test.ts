import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import {
  colorTransformWebGLMaterialRenderer,
  registerWebGLColorTransformMaterials,
  uniformColorTransformWebGLMaterialRenderer,
} from './webglColorTransformMaterial';
import { getWebGLMaterialRenderer } from './webglMaterialRegistry';
import { makeWebGLState } from './webglTestHelper';

function makeColorTransform(redMultiplier: number) {
  return {
    redMultiplier,
    greenMultiplier: 1,
    blueMultiplier: 1,
    alphaMultiplier: 1,
    redOffset: 0,
    greenOffset: 0,
    blueOffset: 0,
    alphaOffset: 0,
  };
}

describe('colorTransformWebGLMaterialRenderer', () => {
  it('declares 8 per-instance floats', () => {
    expect(colorTransformWebGLMaterialRenderer.instanceFloatCount).toBe(8);
  });

  it('packs the supplied material data color transform', () => {
    const out = new Float32Array(8);
    colorTransformWebGLMaterialRenderer.packInstance!(null as any, makeColorTransform(0.5) as any, out, 0);
    expect(out[0]).toBe(0.5);
    expect(out[3]).toBe(1);
  });

  it('packs identity when material data is null', () => {
    const out = new Float32Array(8);
    colorTransformWebGLMaterialRenderer.packInstance!(null as any, null, out, 0);
    expect(Array.from(out)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe('registerWebGLColorTransformMaterials', () => {
  it('registers both color transform material renderers', () => {
    const { state } = makeWebGLState();
    registerWebGLColorTransformMaterials(state);
    expect(getWebGLMaterialRenderer(state, UniformColorTransformMaterialKind)).toBe(
      uniformColorTransformWebGLMaterialRenderer,
    );
    expect(getWebGLMaterialRenderer(state, ColorTransformMaterialKind)).toBe(colorTransformWebGLMaterialRenderer);
  });
});

describe('uniformColorTransformWebGLMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(uniformColorTransformWebGLMaterialRenderer.instanceFloatCount).toBe(0);
  });
});
