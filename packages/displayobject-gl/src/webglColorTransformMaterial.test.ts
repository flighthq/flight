import { getGlMaterialRenderer } from '@flighthq/render-gl';
import { makeGlState } from '@flighthq/render-gl';
import { ColorTransformMaterialKind } from '@flighthq/types';

import { colorTransformGlMaterialRenderer, registerGlColorTransformMaterial } from './webglColorTransformMaterial';

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

describe('colorTransformGlMaterialRenderer', () => {
  it('declares 8 per-instance floats', () => {
    expect(colorTransformGlMaterialRenderer.instanceFloatCount).toBe(8);
  });

  it('packs the supplied material data color transform', () => {
    const out = new Float32Array(8);
    colorTransformGlMaterialRenderer.packInstance!(null as any, makeColorTransform(0.5) as any, out, 0);
    expect(out[0]).toBe(0.5);
    expect(out[3]).toBe(1);
  });

  it('packs identity when material data is null', () => {
    const out = new Float32Array(8);
    colorTransformGlMaterialRenderer.packInstance!(null as any, null, out, 0);
    expect(Array.from(out)).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  });
});

describe('registerGlColorTransformMaterial', () => {
  it('registers the per-instance color transform material renderer', () => {
    const { state } = makeGlState();
    registerGlColorTransformMaterial(state);
    expect(getGlMaterialRenderer(state, ColorTransformMaterialKind)).toBe(colorTransformGlMaterialRenderer);
  });
});
