import * as renderWgpuContractModule from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { BevelEffect, WgpuRenderState, WgpuRenderTarget, WgpuRenderTargetPool } from '@flighthq/types/contract';

import { applyBevelEffectToWgpu, defaultWgpuBevelEffectRunner, registerWgpuBevelEffect } from './wgpuBevelEffect';
import * as wgpuEffectBlitShaderModule from './wgpuEffectBlitShader';
import * as wgpuEffectBoxBlurModule from './wgpuEffectBoxBlur';
import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectTintShaderModule from './wgpuEffectTintShader';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

const recorded = {
  acquired: [] as unknown[],
  blurs: [] as unknown[],
  calls: [] as string[],
  composites: [] as number[][],
  released: [] as unknown[],
  tints: [] as (number | undefined)[][],
};

beforeAll(() => installWgpuMock());

beforeEach(() => {
  vi.spyOn(wgpuEffectPassModule, 'clearWgpuEffectTarget').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectPassModule, 'createWgpuDualSourceEffectPipeline').mockImplementation((() => ({
    pipeline: {},
  })) as never);
  vi.spyOn(wgpuEffectPassModule, 'drawWgpuDualSourceEffectPass').mockImplementation(((
    _state: unknown,
    _field: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(12);
    setUniforms(f32);
    recorded.composites.push([...f32]);
  }) as never);

  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectBlitPass').mockImplementation((() =>
    recorded.calls.push('blit')) as never);
  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectErasePass').mockImplementation((() =>
    recorded.calls.push('erase')) as never);

  vi.spyOn(wgpuEffectBoxBlurModule, 'applyWgpuEffectBoxBlur').mockImplementation(((
    _state: unknown,
    _s: unknown,
    _d: unknown,
    _t: unknown,
    options: unknown,
  ) => {
    recorded.blurs.push(options);
  }) as never);

  vi.spyOn(wgpuEffectTintShaderModule, 'applyWgpuEffectTintPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    color: number,
    alpha: number,
    strength: number,
  ) => {
    recorded.tints.push([color, alpha, strength]);
  }) as never);

  vi.spyOn(renderWgpuContractModule, 'acquireWgpuRenderTarget').mockImplementation(((
    _state: unknown,
    _pool: unknown,
    descriptor: unknown,
  ) => {
    const target = { ...(descriptor as object), id: `scratch-${recorded.acquired.length}`, view: {} };
    recorded.acquired.push(target);
    return target;
  }) as never);
  vi.spyOn(renderWgpuContractModule, 'releaseWgpuRenderTarget').mockImplementation(((_pool: unknown, target: unknown) =>
    recorded.released.push(target)) as never);
});

afterEach(() => vi.restoreAllMocks());

const SOURCE_WIDTH = 100;
const SOURCE_HEIGHT = 50;

function apply(effect: Readonly<Partial<BevelEffect>> = {}): readonly number[] {
  for (const list of [
    recorded.acquired,
    recorded.blurs,
    recorded.calls,
    recorded.composites,
    recorded.released,
    recorded.tints,
  ]) {
    list.length = 0;
  }
  const target = {
    format: 'rgba8unorm',
    height: SOURCE_HEIGHT,
    view: {},
    width: SOURCE_WIDTH,
  } as unknown as WgpuRenderTarget;
  applyBevelEffectToWgpu(
    {} as unknown as WgpuRenderState,
    target,
    target,
    {} as unknown as WgpuRenderTargetPool,
    {
      kind: 'BevelEffect',
      ...effect,
    } as BevelEffect,
  );
  return recorded.composites[0]!;
}

describe('applyBevelEffectToWgpu', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR — branch 1, restorable from git. The highlight and
  // shadow colours used to be read as 24-bit RGB with the `*Alpha` fields standing alone
  // (`effect.shadowColor ?? 0x000000`). They are packed RGBA everywhere else in the SDK, so under the old
  // reading 0x102030c0 shaded the bevel 0x2030c0 at full opacity — a different colour, fully plausible,
  // with the c0 silently becoming part of the blue channel. Unified in 51e364d1d.
  //
  // MEASURED by restoring 51e364d1d^'s exact four lines — 2 of 11 failed:
  //   AssertionError: expected 0.3333333432674408 to be close to 0.615686274509804
  //   AssertionError: expected 0.125490203499794 to be close to 0.06274509803921569
  it('splits a packed RGBA colour into composite RGB and an alpha multiplied by its Alpha field', () => {
    const uniforms = apply({
      highlightAlpha: 0.5,
      highlightColor: 0x9d55ff80,
      shadowAlpha: 1,
      shadowColor: 0x102030c0,
    });

    expect(uniforms[0]).toBeCloseTo(0x9d / 255, 6);
    expect(uniforms[1]).toBeCloseTo(0x55 / 255, 6);
    expect(uniforms[2]).toBeCloseTo(0xff / 255, 6);
    expect(uniforms[3]).toBeCloseTo((0x80 / 255) * 0.5, 6);

    expect(uniforms[4]).toBeCloseTo(0x10 / 255, 6);
    expect(uniforms[5]).toBeCloseTo(0x20 / 255, 6);
    expect(uniforms[6]).toBeCloseTo(0x30 / 255, 6);
    expect(uniforms[7]).toBeCloseTo(0xc0 / 255, 6);
  });

  it('defaults to opaque white over opaque black', () => {
    const uniforms = apply();

    expect(uniforms.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(uniforms.slice(4, 8)).toEqual([0, 0, 0, 1]);
  });

  // ★ THE VERTICAL SEAM, the same class that was wrong in six effects tonight: the light direction
  // arrives in screen space (Y down) and only the Y component is negated on the way into the shader.
  // Written symmetrically, every bevel is lit from the wrong side — and still looks like a bevel.
  it('negates only the vertical component of the light offset', () => {
    // 0 degrees points along +X, 90 degrees along +Y in screen space.
    const alongX = apply({ angle: 0, distance: 10 });
    expect(alongX[8]).toBeCloseTo(10 / SOURCE_WIDTH, 6);
    expect(alongX[9]).toBeCloseTo(0, 6);

    const alongY = apply({ angle: 90, distance: 10 });
    expect(alongY[8]).toBeCloseTo(0, 6);
    expect(alongY[9]).toBeCloseTo(-10 / SOURCE_HEIGHT, 6);
  });

  // Normalised per axis, and the two source dimensions differ here on purpose: with them equal, dividing
  // by the wrong one is invisible.
  it('normalises each offset component by its own source dimension', () => {
    const uniforms = apply({ angle: 45, distance: 10 });

    // cos(45)*10 and sin(45)*10 both round to 7.
    expect(uniforms[8]).toBeCloseTo(7 / SOURCE_WIDTH, 6);
    expect(uniforms[9]).toBeCloseTo(-7 / SOURCE_HEIGHT, 6);
  });

  it('snaps the light offset to whole pixels, matching the surface reference', () => {
    // cos(30)*10 = 8.66 -> 9, sin(30)*10 = 5 -> 5.
    const uniforms = apply({ angle: 30, distance: 10 });

    expect(uniforms[8] * SOURCE_WIDTH).toBeCloseTo(9, 6);
    expect(uniforms[9] * SOURCE_HEIGHT).toBeCloseTo(-5, 6);
  });

  it('maps each bevel type to its clip mode', () => {
    expect(apply({ bevelType: 'inner' })[11]).toBe(1);
    expect(apply({ bevelType: 'outer' })[11]).toBe(2);
    expect(apply({ bevelType: 'full' })[11]).toBe(0);
    // The default is inner, which is the one a caller gets without asking.
    expect(apply()[11]).toBe(1);
  });

  it('draws the source under the bevel for draw mode and erases it for knockout', () => {
    apply({ sourceMode: 'draw' });
    expect(recorded.calls).toEqual(['blit']);

    apply({ sourceMode: 'knockout' });
    expect(recorded.calls).toEqual(['erase']);
  });

  // The field is built with a NEUTRAL tint at strength 1 — `strength` is the per-pixel gradient intensity
  // in the composite, not something baked into the blurred silhouette. Baking it there instead would
  // change the bevel's width as well as its contrast.
  it('builds the alpha field with a neutral tint and passes strength to the composite instead', () => {
    const uniforms = apply({ strength: 3 });

    expect(recorded.tints[0]).toEqual([0xffffffff, 1, 1]);
    expect(uniforms[10]).toBe(3);
  });

  it('releases every scratch target it acquired', () => {
    apply();

    expect(recorded.acquired).toHaveLength(3);
    expect(recorded.released).toEqual(recorded.acquired);
  });
});

describe('defaultWgpuBevelEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    recorded.composites.length = 0;
    const target = { format: 'rgba8unorm', height: 8, view: {}, width: 8 } as unknown as WgpuRenderTarget;

    defaultWgpuBevelEffectRunner(
      { dest: target, pool: {}, source: target, state: {} } as never,
      { kind: 'BevelEffect', shadowColor: 0x102030ff } as BevelEffect,
    );

    expect(recorded.composites[0]![4]).toBeCloseTo(0x10 / 255, 6);
  });
});

describe('registerWgpuBevelEffect', () => {
  it('makes the runner resolvable for the BevelEffect kind', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(getWgpuRenderEffectRunner(state, 'BevelEffect')).toBeNull();
    registerWgpuBevelEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'BevelEffect')).toBe(defaultWgpuBevelEffectRunner);
  });
});
