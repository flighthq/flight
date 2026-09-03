import { createGodRaysEffect } from '@flighthq/effects/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { GodRaysEffect, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectProgramCacheModule from './wgpuEffectProgramCache';
import {
  applyGodRaysEffectToWgpu,
  defaultWgpuGodRaysEffectRunner,
  registerWgpuGodRaysEffect,
} from './wgpuGodRaysEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

const recorded = {
  pipelines: [] as { blend: string; key: string; wgsl: string }[],
  uniforms: [] as number[][],
};

beforeAll(() => installWgpuMock());

beforeEach(() => {
  vi.spyOn(wgpuEffectPassModule, 'drawWgpuEffectPass').mockImplementation(((
    _state: unknown,
    _source: unknown,
    _dest: unknown,
    _pipeline: unknown,
    setUniforms: (f32: Float32Array) => void,
  ) => {
    const f32 = new Float32Array(8);
    setUniforms(f32);
    recorded.uniforms.push([...f32]);
  }) as never);

  vi.spyOn(wgpuEffectProgramCacheModule, 'getWgpuEffectPipeline').mockImplementation(((
    _state: unknown,
    key: string,
    wgsl: string,
    blend: string,
  ) => {
    recorded.pipelines.push({ blend, key, wgsl });
    return { pipeline: {} };
  }) as never);
});

afterEach(() => vi.restoreAllMocks());

function apply(effect: Readonly<Partial<GodRaysEffect>> = {}): readonly number[] {
  recorded.pipelines.length = 0;
  recorded.uniforms.length = 0;
  const target = { height: 64, view: {}, width: 64 } as unknown as WgpuRenderTarget;
  applyGodRaysEffectToWgpu({} as unknown as WgpuRenderState, target, target, createGodRaysEffect(effect));
  return recorded.uniforms[0]!;
}

describe('applyGodRaysEffectToWgpu', () => {
  // ★ NOT CHECKED AGAINST A HISTORICAL DEFECT, AND THAT IS A FINDING RATHER THAN AN OMISSION. This file
  // reached the perishable branch-1 list only because c1dcc6c9b — the commit that fixed the GL sibling's
  // centerY — also touched it. It touched it with a COMMENT and nothing else: this runner was correct all
  // along, and there is no prior line to restore. Said out loud, because an unstated absence reads as a
  // proof that was done.
  //
  // ★ WHAT MAKES IT WORTH A TEST ANYWAY: the pass-through IS the convention. `centerY` is declared
  // top-left-origin and wgpuEffectPass's fullscreen uv is ALREADY top-left, so this backend must NOT
  // convert while its Gl sibling must. Half of a two-sided invariant is not the weaker half, and "adding
  // a flip here for symmetry" is exactly the plausible edit that breaks it.
  //
  // Verified by construction, since history offers nothing to restore. MEASURED by adding `1 -` to this
  // runner's centerY — 4 of 9 failed:
  //   AssertionError: expected [ 0.25, 0.800000011920929 ] to deeply equal [ 0.25, 0.20000000298023224 ]
  //   AssertionError: expected 0.10000000149011612 to be close to 0.9, received difference is 0.7999999985098839
  //   AssertionError: expected 0.10000000149011612 to be greater than 0.8999999761581421
  //   AssertionError: expected 0.75 to be close to 0.25, received difference is 0.5
  it('passes a top-left centerY through unconverted', () => {
    expect(apply({ centerX: 0.25, centerY: 0.2 }).slice(0, 2)).toEqual([0.25, Math.fround(0.2)]);
  });

  it('keeps a light near the bottom of the frame near the bottom', () => {
    expect(apply({ centerY: 0.9 })[1]).toBeCloseTo(0.9, 6);
  });

  it('maps a lower light to a larger value than a higher one, since uv counts down', () => {
    const high = apply({ centerY: 0.1 })[1]!;
    const low = apply({ centerY: 0.9 })[1]!;

    expect(low).toBeGreaterThan(high);
  });

  it('defaults the light to the frame centre, the one value a flip cannot be seen at', () => {
    expect(apply().slice(0, 2)).toEqual([0.5, 0.5]);
  });

  it('passes the marching parameters through as descriptor defaults', () => {
    const uniforms = apply();

    expect(uniforms[2]).toBeCloseTo(0.96, 6);
    expect(uniforms[3]).toBeCloseTo(0.93, 6);
    expect(uniforms[4]).toBeCloseTo(0.4, 6);
    expect(uniforms[5]).toBeCloseTo(0.6, 6);
  });

  // ★ THE SAMPLE COUNT IS BAKED INTO THE WGSL, because a loop bound must be const — so it belongs to the
  // pipeline KEY, not to a uniform. Keyed wrongly, a scene that changes its sample count would keep the
  // first count's pipeline and quietly march the wrong number of steps.
  it('rounds the sample count into the pipeline key and floors it at one', () => {
    apply({ samples: 12.4 });
    expect(recorded.pipelines[0]!.key).toBe('atmospheric.godRays.12');

    apply({ samples: 0 });
    expect(recorded.pipelines[0]!.key).toBe('atmospheric.godRays.1');
  });

  it('bakes the same count into the shader it keys under', () => {
    apply({ samples: 12 });

    expect(recorded.pipelines[0]!.wgsl).toContain('12');
    expect(recorded.pipelines[0]!.blend).toBe('replace');
  });
});

describe('defaultWgpuGodRaysEffectRunner', () => {
  it('routes the runner context through to the pass', () => {
    recorded.uniforms.length = 0;
    const target = { height: 8, view: {}, width: 8 } as unknown as WgpuRenderTarget;

    defaultWgpuGodRaysEffectRunner(
      { dest: target, pool: {}, source: target, state: {} } as never,
      createGodRaysEffect({ centerY: 0.25 }),
    );

    expect(recorded.uniforms[0]![1]).toBeCloseTo(0.25, 6);
  });
});

describe('registerWgpuGodRaysEffect', () => {
  it('makes the runner resolvable for the GodRaysEffect kind', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(getWgpuRenderEffectRunner(state, 'GodRaysEffect')).toBeNull();
    registerWgpuGodRaysEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'GodRaysEffect')).toBe(defaultWgpuGodRaysEffectRunner);
  });
});
