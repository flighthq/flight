import { createGradientBevelEffect } from '@flighthq/effects/contract';
import * as renderWgpuContractModule from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type {
  GradientBevelEffect,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuRenderTargetPool,
} from '@flighthq/types/contract';

import * as wgpuEffectBlitShaderModule from './wgpuEffectBlitShader';
import * as wgpuEffectBoxBlurModule from './wgpuEffectBoxBlur';
import * as wgpuEffectGradientRampModule from './wgpuEffectGradientRamp';
import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectTintShaderModule from './wgpuEffectTintShader';
import {
  applyGradientBevelEffectToWgpu,
  defaultWgpuGradientBevelEffectRunner,
  registerWgpuGradientBevelEffect,
} from './wgpuGradientBevelEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

const recorded = {
  acquired: [] as unknown[],
  calls: [] as string[],
  passes: [] as { bindGroups: number[]; dest: unknown; loadOp: string }[],
  ramps: [] as { alphas: unknown; colors: unknown; ratios: unknown }[],
  released: [] as unknown[],
  slots: [] as number[],
  tints: [] as number[][],
  uniforms: [] as number[][],
};

const passState = {
  acquireSlot: vi.fn(() => recorded.slots.push(recorded.slots.length * 256) && recorded.slots.at(-1)!),
  beginPass: vi.fn((dest: unknown, loadOp: string) => {
    recorded.passes.push({ bindGroups: [], dest, loadOp });
    const current = recorded.passes.at(-1)!;
    return {
      draw: vi.fn(),
      end: vi.fn(),
      setBindGroup: vi.fn((index: number) => current.bindGroups.push(index)),
      setPipeline: vi.fn(),
    };
  }),
  sampler: { id: 'sampler' },
  textureBGLayout: { id: 'textureBGLayout' },
  uniformBG: { id: 'uniformBG' },
  uniformBGLayout: { id: 'uniformBGLayout' },
  writeSlot: vi.fn((_offset: number, write: (f32: Float32Array) => void) => {
    const f32 = new Float32Array(4);
    write(f32);
    recorded.uniforms.push([...f32]);
  }),
};

let restoreEffectVertexWgsl: (() => void) | null = null;

beforeAll(() => installWgpuMock());

beforeEach(() => {
  vi.spyOn(wgpuEffectPassModule, 'clearWgpuEffectTarget').mockImplementation((() =>
    recorded.calls.push('clear')) as never);
  vi.spyOn(wgpuEffectPassModule, 'getWgpuEffectPassState').mockReturnValue(passState as never);
  const original = Object.getOwnPropertyDescriptor(wgpuEffectPassModule, 'EFFECT_VERTEX_WGSL');
  // eslint-disable-next-line no-import-assign -- replacing a non-function export for test; works on Vite SSR namespaces
  Object.defineProperty(wgpuEffectPassModule, 'EFFECT_VERTEX_WGSL', { value: 'VERTEX\n', configurable: true });
  restoreEffectVertexWgsl = () => {
    // eslint-disable-next-line no-import-assign -- restoring the original descriptor captured above
    if (original !== undefined) Object.defineProperty(wgpuEffectPassModule, 'EFFECT_VERTEX_WGSL', original);
  };

  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectBlitPass').mockImplementation(((
    _state: unknown,
    source: { id?: string },
  ) => recorded.calls.push(`blit:${source.id ?? 'scratch'}`)) as never);
  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectErasePass').mockImplementation((() =>
    recorded.calls.push('erase')) as never);

  vi.spyOn(wgpuEffectBoxBlurModule, 'applyWgpuEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectGradientRampModule, 'getWgpuEffectGradientRampTexture').mockImplementation(((
    _state: unknown,
    colors: unknown,
    alphas: unknown,
    ratios: unknown,
  ) => {
    recorded.ramps.push({ alphas, colors, ratios });
    return { createView: () => ({ id: 'rampView' }) };
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
    descriptor: object,
  ) => {
    const target = { ...descriptor, id: `scratch-${recorded.acquired.length}`, view: {} };
    recorded.acquired.push(target);
    return target;
  }) as never);
  vi.spyOn(renderWgpuContractModule, 'releaseWgpuRenderTarget').mockImplementation(((_pool: unknown, target: unknown) =>
    recorded.released.push(target)) as never);
});

afterEach(() => {
  restoreEffectVertexWgsl?.();
  restoreEffectVertexWgsl = null;
  vi.restoreAllMocks();
});

const SOURCE_WIDTH = 100;
const SOURCE_HEIGHT = 50;

const STOPS = { alphas: [1, 1], colors: [0x000000, 0xffffff], ratios: [0, 255] };

// Enough device surface for the two pipelines this recipe builds itself; the shared pass state is
// mocked above, so nothing here touches a real adapter.
function createDevice(): GPUDevice {
  return {
    createBindGroup: vi.fn((descriptor: unknown) => ({ descriptor })),
    createPipelineLayout: vi.fn((descriptor: unknown) => ({ descriptor })),
    createRenderPipeline: vi.fn(() => ({ id: 'pipeline' })),
    createShaderModule: vi.fn((descriptor: unknown) => ({ descriptor })),
  } as unknown as GPUDevice;
}

function apply(effect: Readonly<Partial<GradientBevelEffect>> = {}): void {
  for (const key of Object.keys(recorded) as (keyof typeof recorded)[]) recorded[key].length = 0;
  const state = { device: createDevice() } as unknown as WgpuRenderState;
  const target = {
    format: 'rgba8unorm',
    height: SOURCE_HEIGHT,
    id: 'source',
    view: {},
    width: SOURCE_WIDTH,
  } as unknown as WgpuRenderTarget;
  applyGradientBevelEffectToWgpu(
    state,
    target,
    target,
    {} as unknown as WgpuRenderTargetPool,
    createGradientBevelEffect({ ...STOPS, ...effect }),
  );
}

/** The encode pass writes the light offset into the first slot it acquires. */
function lightOffset(): readonly number[] {
  return recorded.uniforms[0]!.slice(0, 2);
}

describe('applyGradientBevelEffectToWgpu', () => {
  // ★ THE DEFECT THIS REPLACES A `typeof` CHECK FOR — branch 1, restorable from git. The neutral tint was
  // written `0xffffff`, a 24-bit value, after the shared tint helper had moved to packed RGBA. Read as
  // RGBA that is r=0x00 g=0xff b=0xff at alpha 0x00 — a fully TRANSPARENT cyan where an opaque white was
  // meant, which zeroes the blur basis the whole bevel is built from. Unified in e2b82c710.
  //
  // MEASURED by restoring e2b82c710^'s exact line `applyWgpuEffectTintPass(state, src, s0, 0xffffff, 1,
  // Math.min(1, strength));` — 2 of 11 failed:
  //   AssertionError: expected 16777215 to be 4294967295 // Object.is equality
  //   AssertionError: expected 16777215 to be 4294967295 // Object.is equality
  it('builds the blur basis with an opaque white tint, in packed RGBA', () => {
    apply();

    expect(recorded.tints[0]![0]).toBe(0xffffffff);
  });

  // `strength` is clamped into the tint at at most 1 — above that it is the gradient's business, not the
  // basis's, so a strength of 3 must not brighten the field three times over.
  it('clamps the strength it folds into the basis at one', () => {
    apply({ strength: 3 });
    expect(recorded.tints[0]![2]).toBe(1);

    apply({ strength: 0.25 });
    expect(recorded.tints[0]![2]).toBe(0.25);
  });

  // ★ THE VERTICAL SEAM, the same class that was wrong in six effects tonight: the light direction
  // arrives in screen space (Y down) and only the Y component is negated into the target's contents.
  it('negates only the vertical component of the light offset', () => {
    apply({ angle: 0, distance: 10 });
    expect(lightOffset()[0]).toBeCloseTo(10 / SOURCE_WIDTH, 6);
    expect(lightOffset()[1]).toBeCloseTo(0, 6);

    apply({ angle: 90, distance: 10 });
    expect(lightOffset()[0]).toBeCloseTo(0, 6);
    expect(lightOffset()[1]).toBeCloseTo(-10 / SOURCE_HEIGHT, 6);
  });

  // Normalised per axis; the two source dimensions differ on purpose, since with them equal dividing by
  // the wrong one is invisible. Unlike the plain bevel, this recipe does NOT snap to whole pixels.
  it('normalises each offset component by its own source dimension, without rounding', () => {
    apply({ angle: 30, distance: 10 });

    expect(lightOffset()[0]).toBeCloseTo((Math.cos(Math.PI / 6) * 10) / SOURCE_WIDTH, 6);
    expect(lightOffset()[1]).toBeCloseTo(-(Math.sin(Math.PI / 6) * 10) / SOURCE_HEIGHT, 6);
  });

  it('looks the band colour up from the descriptor stops, unchanged', () => {
    apply({ alphas: [0, 0.5, 1], colors: [0x112233, 0x445566, 0x778899], ratios: [0, 128, 255] });

    expect(recorded.ramps[0]).toEqual({
      alphas: [0, 0.5, 1],
      colors: [0x112233, 0x445566, 0x778899],
      ratios: [0, 128, 255],
    });
  });

  // Two passes, in order: encode the bevel from the blurred alpha, then look the gradient up and clip.
  // The apply pass binds four groups — uniforms, encoded, ramp, source — and getting that order wrong
  // grades the bevel through the source instead of the ramp.
  it('runs the encode pass then the four-group apply pass', () => {
    apply();

    expect(recorded.passes).toHaveLength(2);
    expect(recorded.passes[0]!.bindGroups).toEqual([0, 1]);
    expect(recorded.passes[1]!.bindGroups).toEqual([0, 1, 2, 3]);
  });

  it('gives the two passes different uniform slots', () => {
    apply();

    expect(recorded.slots[0]).not.toBe(recorded.slots[1]);
  });

  it('draws the source under the bevel for draw mode and erases it for knockout', () => {
    apply({ sourceMode: 'draw' });
    expect(recorded.calls).toEqual(['clear', 'blit:source', 'blit:scratch-1']);

    apply({ sourceMode: 'knockout' });
    expect(recorded.calls).toEqual(['clear', 'blit:scratch-1', 'erase']);
  });

  it('releases every scratch target it acquired', () => {
    apply();

    expect(recorded.acquired).toHaveLength(3);
    expect(recorded.released).toEqual(recorded.acquired);
  });
});

describe('defaultWgpuGradientBevelEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    for (const key of Object.keys(recorded) as (keyof typeof recorded)[]) recorded[key].length = 0;
    const target = { format: 'rgba8unorm', height: 8, id: 'source', view: {}, width: 8 } as unknown as WgpuRenderTarget;

    defaultWgpuGradientBevelEffectRunner(
      {
        dest: target,
        pool: {},
        source: target,
        state: { device: createDevice() },
      } as never,
      createGradientBevelEffect(STOPS),
    );

    expect(recorded.tints[0]![0]).toBe(0xffffffff);
  });
});

describe('EFFECT_VERTEX_WGSL namespace stub', () => {
  it('is restored after each test, so it cannot leak to other files', () => {
    restoreEffectVertexWgsl?.();
    expect(wgpuEffectPassModule.EFFECT_VERTEX_WGSL).toContain('struct VertexOut');
  });
});

describe('registerWgpuGradientBevelEffect', () => {
  it('makes the runner resolvable for the GradientBevelEffect kind', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(getWgpuRenderEffectRunner(state, 'GradientBevelEffect')).toBeNull();
    registerWgpuGradientBevelEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'GradientBevelEffect')).toBe(defaultWgpuGradientBevelEffectRunner);
  });
});
