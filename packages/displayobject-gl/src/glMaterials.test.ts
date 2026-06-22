import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { makeGlState } from '@flighthq/render-gl';
import { ColorTransformMaterialKind, UniformColorTransformMaterialKind } from '@flighthq/types';

import { getGlRenderProxyColorTransform, registerGlColorTransformShader } from './glMaterials';

describe('getGlRenderProxyColorTransform', () => {
  it('returns null when the node has no material', () => {
    expect(getGlRenderProxyColorTransform({ material: null } as never)).toBeNull();
  });

  it('returns the value carried on a uniform color transform material', () => {
    const colorTransform = { redMultiplier: 0.5 };
    const node = { material: { kind: UniformColorTransformMaterialKind, colorTransform } } as never;
    expect(getGlRenderProxyColorTransform(node)).toBe(colorTransform);
  });

  it('returns the per-node material data for a color transform material', () => {
    const colorTransform = { redMultiplier: 0.5 };
    const node = { material: { kind: ColorTransformMaterialKind }, materialData: colorTransform } as never;
    expect(getGlRenderProxyColorTransform(node)).toBe(colorTransform);
  });
});

describe('registerGlColorTransformShader', () => {
  it('registers a color transform shader on the render state', () => {
    const { state } = makeGlState();

    registerGlColorTransformShader(state);

    expect(getGlRenderStateRuntime(state).colorTransformBitmapShader).toBeDefined();
  });

  it('does not make the color transform shader the state default shader', () => {
    const { state } = makeGlState();

    registerGlColorTransformShader(state);

    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.defaultBitmapShader).not.toBe(runtime.colorTransformBitmapShader);
  });

  it('includes color transform uniform locations', () => {
    const { state } = makeGlState();

    registerGlColorTransformShader(state);

    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.colorTransformBitmapShader?.locations.locColorMultiplier).toBeDefined();
    expect(runtime.colorTransformBitmapShader?.locations.locColorOffset).toBeDefined();
    expect(runtime.colorTransformBitmapShader?.locations.locHasColorTransform).toBeDefined();
  });

  it('binds color transform uniforms from the node material data', () => {
    const { state, gl } = makeGlState();
    const renderProxy = {
      alpha: 0.75,
      material: { kind: ColorTransformMaterialKind },
      materialData: {
        redMultiplier: 0.5,
        greenMultiplier: 0.25,
        blueMultiplier: 1.5,
        alphaMultiplier: 0.8,
        redOffset: 10,
        greenOffset: 20,
        blueOffset: 30,
        alphaOffset: 40,
      },
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };

    registerGlColorTransformShader(state);
    const runtime = getGlRenderStateRuntime(state);
    runtime.colorTransformBitmapShader!.bind(gl, state, renderProxy as never);

    const loc = runtime.colorTransformBitmapShader!.locations;
    expect(gl.uniform1i).toHaveBeenCalledWith(loc.locHasColorTransform, 1);
    expect(gl.uniform4f).toHaveBeenCalledWith(loc.locColorMultiplier, 0.5, 0.25, 1.5, 0.8);
    expect(gl.uniform4f).toHaveBeenCalledWith(loc.locColorOffset, 10 / 255, 20 / 255, 30 / 255, 40 / 255);
  });

  it('does not replace an existing color transform shader', () => {
    const { state } = makeGlState();

    registerGlColorTransformShader(state);
    const first = getGlRenderStateRuntime(state).colorTransformBitmapShader;
    registerGlColorTransformShader(state);

    expect(getGlRenderStateRuntime(state).colorTransformBitmapShader).toBe(first);
  });
});
