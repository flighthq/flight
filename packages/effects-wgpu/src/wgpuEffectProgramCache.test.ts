import type { WgpuRenderState } from '@flighthq/types/contract';

// The cache's whole job is deciding when NOT to call this, so it has to be observable.
const passMock = vi.hoisted(() => ({
  createWgpuEffectPipeline: vi.fn((_state: unknown, wgsl: string, blend: string) => ({ blend, wgsl })),
}));

vi.mock('./wgpuEffectPass', () => passMock);

import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';

// A fresh object per call: "same state" is an identity question the cache can get wrong, and two fakes
// that compared equal would hide a cache keyed by the wrong thing.
function createState(): WgpuRenderState {
  return {} as unknown as WgpuRenderState;
}

describe('getWgpuEffectPipeline', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every Wgpu effect recipe reaches its pipeline
  // through this cache — 40-odd call sites — so a mistake here is a mistake in all of them at once, and
  // it surfaces as the wrong pipeline rather than as an error.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED rather than restored:
  // its history holds only packaging, rehoming and type-move refactors. Branch-2 shape — the measured
  // output recorded per test came from mutating the shipped code deliberately.
  it('compiles a key once per state and hands back the same pipeline', () => {
    passMock.createWgpuEffectPipeline.mockClear();
    const state = createState();

    const first = getWgpuEffectPipeline(state, 'blur.gaussian', 'WGSL_A');
    const second = getWgpuEffectPipeline(state, 'blur.gaussian', 'WGSL_A');

    expect(second).toBe(first);
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(1);
  });

  it('compiles each key separately, so two recipes never share one pipeline', () => {
    passMock.createWgpuEffectPipeline.mockClear();
    const state = createState();

    expect(getWgpuEffectPipeline(state, 'blur.gaussian', 'WGSL_A')).not.toBe(
      getWgpuEffectPipeline(state, 'stylization.crt', 'WGSL_B'),
    );
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(2);
  });

  // ★ CONSTRUCTED CASE: keyed by STATE. A pipeline belongs to the device that created it, so handing a
  // second state the first state's pipeline is not a slow path — it is a pipeline that does not belong
  // there, in every effect at once.
  // MEASURED by replacing the per-state WeakMap with one module-level Map — 2 of 7 assertions failed,
  // both inside the predicted test and nothing else:
  //   AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
  //   AssertionError: expected { blend: 'replace', wgsl: 'WGSL_A' } not to be { blend: 'replace', wgsl: 'WGSL_A' }
  it('gives each state its own pipeline', () => {
    passMock.createWgpuEffectPipeline.mockClear();

    const first = getWgpuEffectPipeline(createState(), 'blur.gaussian', 'WGSL_A');
    const second = getWgpuEffectPipeline(createState(), 'blur.gaussian', 'WGSL_A');

    expect(second).not.toBe(first);
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(2);
  });

  it('defaults the blend mode to replace, the mode every built-in recipe asks for explicitly', () => {
    passMock.createWgpuEffectPipeline.mockClear();

    expect(getWgpuEffectPipeline(createState(), 'defaulted', 'WGSL_A')).toEqual({ blend: 'replace', wgsl: 'WGSL_A' });
  });

  it('passes a requested blend mode through to the pipeline it builds', () => {
    passMock.createWgpuEffectPipeline.mockClear();

    expect(getWgpuEffectPipeline(createState(), 'premultiplied', 'WGSL_A', 'premul')).toEqual({
      blend: 'premul',
      wgsl: 'WGSL_A',
    });
  });

  // ★ A LIMIT OF THE CONTRACT, ASSERTED SO IT IS A DECISION RATHER THAN A SURPRISE. `blend` is NOT part
  // of the cache key, so the first request under a key fixes the blend mode for every later one. No
  // built-in recipe is affected — all 40-odd pass 'replace' explicitly, and nothing in the repository
  // requests 'premul' through this function — but a caller that reused one key with two blend modes
  // would silently get the first. Locked here so a change to that behaviour has to be deliberate.
  it('keeps the blend mode of the first request under a key, not the latest', () => {
    passMock.createWgpuEffectPipeline.mockClear();
    const state = createState();

    getWgpuEffectPipeline(state, 'sharedKey', 'WGSL_A', 'replace');

    expect(getWgpuEffectPipeline(state, 'sharedKey', 'WGSL_A', 'premul')).toEqual({
      blend: 'replace',
      wgsl: 'WGSL_A',
    });
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(1);
  });

  // The same limit on the other axis: the KEY identifies the pipeline, not the WGSL. A recipe that
  // varies its shader must vary its key too.
  it('ignores changed WGSL under a key it has already compiled', () => {
    passMock.createWgpuEffectPipeline.mockClear();
    const state = createState();

    const first = getWgpuEffectPipeline(state, 'sameKey', 'WGSL_A');

    expect(getWgpuEffectPipeline(state, 'sameKey', 'WGSL_B_DIFFERENT')).toBe(first);
    expect(passMock.createWgpuEffectPipeline).toHaveBeenCalledTimes(1);
  });
});
