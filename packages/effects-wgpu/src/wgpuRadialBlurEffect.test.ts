import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { RadialBlurEffect, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectProgramCacheModule from './wgpuEffectProgramCache';

let recorded = {
  pipelines: [] as { blend: string; key: string }[],
  uniforms: [] as number[][],
};

beforeEach(() => {
  recorded = {
    pipelines: [],
    uniforms: [],
  };

  vi.spyOn(wgpuEffectPassModule, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(4);
    setUniforms(f32);
    recorded.uniforms.push([...f32]);
  }) as never);

  vi.spyOn(wgpuEffectProgramCacheModule, 'getWgpuEffectPipeline').mockImplementation(((
    _state: unknown,
    key: string,
    _wgsl: string,
    blend: string,
  ) => {
    recorded.pipelines.push({ blend, key });
    return { pipeline: {} };
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

import {
  applyRadialBlurEffectToWgpu,
  defaultWgpuRadialBlurEffectRunner,
  registerWgpuRadialBlurEffect,
} from './wgpuRadialBlurEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => installWgpuMock());

function apply(effect: Readonly<Partial<RadialBlurEffect>> = {}): readonly number[] {
  recorded.pipelines.length = 0;
  recorded.uniforms.length = 0;
  const target = { height: 64, view: {}, width: 64 } as unknown as WgpuRenderTarget;
  applyRadialBlurEffectToWgpu({} as unknown as WgpuRenderState, target, target, {
    kind: 'RadialBlurEffect',
    ...effect,
  } as RadialBlurEffect);
  return recorded.uniforms[0]!;
}

describe('applyRadialBlurEffectToWgpu', () => {
  // ★ NOT CHECKED AGAINST A HISTORICAL DEFECT, AND THAT IS A FINDING RATHER THAN AN OMISSION. This file
  // was on the perishable branch-1 list only because df48bfa1c — the commit that fixed the GL sibling's
  // centerY — also touched it. It touched it with a COMMENT and nothing else: this runner was correct all
  // along, and there is no prior line to restore. Its absence from the proof is stated, not implied by
  // silence.
  //
  // ★ WHAT MAKES IT WORTH A TEST ANYWAY: the pass-through IS the convention. `centerY` is screen space,
  // top-left origin, and wgpuEffectPass's fullscreen uv is ALREADY top-left, so this backend must NOT
  // convert — while its Gl sibling must. Half of a two-sided invariant is not a weaker claim than the
  // other half, and "adding a flip here for symmetry" is exactly the plausible edit that breaks it.
  //
  // Verified by construction, since history offers nothing to restore. MEASURED by adding `1 -` to this
  // runner's centerY — 4 of 8 failed:
  //   AssertionError: expected [ 0.30000001192092896, …(1) ] to deeply equal [ 0.30000001192092896, …(1) ]
  //   AssertionError: expected 0.10000000149011612 to be close to 0.9, received difference is 0.7999999985098839
  //   AssertionError: expected 0.10000000149011612 to be greater than 0.8999999761581421
  //   AssertionError: expected 0.75 to be close to 0.25, received difference is 0.5
  it('passes a top-left centerY through unconverted', () => {
    expect(apply({ centerX: 0.3, centerY: 0.4 }).slice(0, 2)).toEqual([Math.fround(0.3), Math.fround(0.4)]);
  });

  it('keeps a centre near the top of the frame near the top', () => {
    expect(apply({ centerY: 0.9 })[1]).toBeCloseTo(0.9, 6);
  });

  // The ordering claim, which is what a flip breaks and a mere offset would not.
  it('maps a lower centre to a larger value than a higher one, since uv counts down', () => {
    const high = apply({ centerY: 0.1 })[1]!;
    const low = apply({ centerY: 0.9 })[1]!;

    expect(low).toBeGreaterThan(high);
  });

  it('defaults to the frame centre, the one value a flip cannot be seen at', () => {
    expect(apply().slice(0, 2)).toEqual([0.5, 0.5]);
  });

  it('passes strength and sample count through as descriptor defaults', () => {
    const uniforms = apply();

    expect(uniforms[2]).toBeCloseTo(0.2, 6);
    expect(uniforms[3]).toBe(16);
  });

  // One pipeline for every parameterisation: the sample count is a uniform here, unlike god rays where
  // it is baked into the WGSL loop bound and therefore keyed.
  it('compiles one replace-blend pipeline regardless of the descriptor', () => {
    apply({ samples: 8 });
    const first = recorded.pipelines[0]!;
    apply({ samples: 32 });

    expect(recorded.pipelines[0]!.key).toBe(first.key);
    expect(first.key).toBe('motion.radialBlur');
    expect(first.blend).toBe('replace');
  });
});

describe('defaultWgpuRadialBlurEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    recorded.uniforms.length = 0;
    const target = { height: 8, view: {}, width: 8 } as unknown as WgpuRenderTarget;

    defaultWgpuRadialBlurEffectRunner(
      { dest: target, pool: {}, source: target, state: {} } as never,
      {
        centerY: 0.25,
        kind: 'RadialBlurEffect',
      } as RadialBlurEffect,
    );

    expect(recorded.uniforms[0]![1]).toBeCloseTo(0.25, 6);
  });
});

describe('registerWgpuRadialBlurEffect', () => {
  it('makes the runner resolvable for the RadialBlurEffect kind', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(getWgpuRenderEffectRunner(state, 'RadialBlurEffect')).toBeNull();
    registerWgpuRadialBlurEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'RadialBlurEffect')).toBe(defaultWgpuRadialBlurEffectRunner);
  });
});
