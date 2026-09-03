import { createLensDirtEffect } from '@flighthq/effects/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlRenderTarget } from '@flighthq/types/contract';

import * as glBlurEffect from './glBlurEffect';
import * as glEffectProgramCache from './glEffectProgramCache';
import { applyLensDirtEffectToGl, defaultGlLensDirtEffectRunner, registerGlLensDirtEffect } from './glLensDirtEffect';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;
  vi.spyOn(renderGlContract, 'acquireGlRenderTarget').mockImplementation(((
    _state: never,
    _pool: never,
    descriptor: never,
  ) => ({
    ...(descriptor as Record<string, unknown>),
    id: `scratch-${nextTargetId++}`,
    texture: {},
  })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'releaseGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(glBlurEffect, 'applyGaussianBlurToGl').mockImplementation((() => {}) as never);
  vi.spyOn(glEffectProgramCache, 'getGlEffectProgram').mockImplementation(((_state: never, key: never) => ({
    program: key,
  })) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyLensDirtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToGl).toBe('function');
  });

  it('blurs a thresholded bright branch before the dirt-modulated composite', () => {
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');
    const pool = createPool();

    applyLensDirtEffectToGl(
      state,
      source,
      dest,
      pool,
      createLensDirtEffect({
        intensity: 1.5,
        seed: 4,
        threshold: 0.45,
      }),
    );

    expect(renderGlContract.acquireGlRenderTarget).toHaveBeenCalledTimes(3);
    const [bright, blurred, temp] = vi
      .mocked(renderGlContract.acquireGlRenderTarget)
      .mock.results.map((result) => result.value!) as [GlRenderTarget, GlRenderTarget, GlRenderTarget];
    expect(glEffectProgramCache.getGlEffectProgram).toHaveBeenNthCalledWith(
      1,
      state,
      'lens.lensDirt.bright',
      expect.any(String),
    );
    expect(renderGlContract.drawGlFullscreenPass).toHaveBeenNthCalledWith(
      1,
      state,
      expect.anything(),
      [source.texture],
      bright,
      expect.any(Function),
    );
    expect(glBlurEffect.applyGaussianBlurToGl).toHaveBeenCalledWith(state, bright, blurred, temp, {
      blurX: 8,
      blurY: 8,
    });
    expect(glEffectProgramCache.getGlEffectProgram).toHaveBeenNthCalledWith(
      2,
      state,
      'lens.lensDirt.composite',
      expect.any(String),
    );
    expect(renderGlContract.drawGlFullscreenPass).toHaveBeenNthCalledWith(
      2,
      state,
      expect.anything(),
      [source.texture, blurred.texture],
      dest,
      expect.any(Function),
    );
    expect(renderGlContract.releaseGlRenderTarget).toHaveBeenNthCalledWith(1, pool, bright);
    expect(renderGlContract.releaseGlRenderTarget).toHaveBeenNthCalledWith(2, pool, blurred);
    expect(renderGlContract.releaseGlRenderTarget).toHaveBeenNthCalledWith(3, pool, temp);

    const uniform1f = vi.fn();
    const gl = { getUniformLocation: vi.fn((_program, name) => name), uniform1f };
    vi.mocked(renderGlContract.drawGlFullscreenPass).mock.calls[0]![4](gl as never, { program: 'bright' } as never);
    vi.mocked(renderGlContract.drawGlFullscreenPass).mock.calls[1]![4](
      gl as never,
      {
        program: 'composite',
      } as never,
    );
    expect(uniform1f).toHaveBeenCalledWith('u_threshold', 0.45);
    expect(uniform1f).toHaveBeenCalledWith('u_intensity', 1.5);
    expect(uniform1f).toHaveBeenCalledWith('u_seed', 4);
  });
});

describe('defaultGlLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensDirtEffectRunner).toBe('function');
  });
});

function createPool(): never {
  return { free: [] } as never;
}

function createState(): never {
  return { gl: {} } as never;
}

function createTarget(id: string): GlRenderTarget {
  return { format: 'rgba8', height: 16, id, texture: {}, width: 32 } as unknown as GlRenderTarget;
}

describe('registerGlLensDirtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensDirtEffect).toBeTypeOf('function');
  });
});
