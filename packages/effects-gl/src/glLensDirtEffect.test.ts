vi.mock('@flighthq/render-gl/contract', () => {
  let nextTargetId = 0;
  return {
    acquireGlRenderTarget: vi.fn((_state, _pool, descriptor) => ({
      ...descriptor,
      id: `scratch-${nextTargetId++}`,
      texture: {},
    })),
    drawGlFullscreenPass: vi.fn(),
    releaseGlRenderTarget: vi.fn(),
  };
});

vi.mock('./glBlurEffect', () => ({
  applyGaussianBlurToGl: vi.fn(),
}));

vi.mock('./glEffectProgramCache', () => ({
  getGlEffectProgram: vi.fn((_state, key) => ({ program: key })),
}));

import { acquireGlRenderTarget, drawGlFullscreenPass, releaseGlRenderTarget } from '@flighthq/render-gl/contract';

import { applyGaussianBlurToGl } from './glBlurEffect';
import { getGlEffectProgram } from './glEffectProgramCache';
import { applyLensDirtEffectToGl, defaultGlLensDirtEffectRunner, registerGlLensDirtEffect } from './glLensDirtEffect';

describe('applyLensDirtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToGl).toBe('function');
  });

  it('blurs a thresholded bright branch before the dirt-modulated composite', () => {
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');
    const pool = createPool();

    applyLensDirtEffectToGl(state, source, dest, pool, {
      intensity: 1.5,
      kind: 'LensDirtEffect',
      seed: 4,
      threshold: 0.45,
    });

    expect(acquireGlRenderTarget).toHaveBeenCalledTimes(3);
    const [bright, blurred, temp] = vi.mocked(acquireGlRenderTarget).mock.results.map((result) => result.value!);
    expect(getGlEffectProgram).toHaveBeenNthCalledWith(1, state, 'lens.lensDirt.bright', expect.any(String));
    expect(drawGlFullscreenPass).toHaveBeenNthCalledWith(
      1,
      state,
      expect.anything(),
      [source.texture],
      bright,
      expect.any(Function),
    );
    expect(applyGaussianBlurToGl).toHaveBeenCalledWith(state, bright, blurred, temp, { blurX: 8, blurY: 8 });
    expect(getGlEffectProgram).toHaveBeenNthCalledWith(2, state, 'lens.lensDirt.composite', expect.any(String));
    expect(drawGlFullscreenPass).toHaveBeenNthCalledWith(
      2,
      state,
      expect.anything(),
      [source.texture, blurred.texture],
      dest,
      expect.any(Function),
    );
    expect(releaseGlRenderTarget).toHaveBeenNthCalledWith(1, pool, bright);
    expect(releaseGlRenderTarget).toHaveBeenNthCalledWith(2, pool, blurred);
    expect(releaseGlRenderTarget).toHaveBeenNthCalledWith(3, pool, temp);

    const uniform1f = vi.fn();
    const gl = { getUniformLocation: vi.fn((_program, name) => name), uniform1f };
    vi.mocked(drawGlFullscreenPass).mock.calls[0]![4](gl as never, { program: 'bright' } as never);
    vi.mocked(drawGlFullscreenPass).mock.calls[1]![4](gl as never, { program: 'composite' } as never);
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

beforeEach(() => {
  vi.clearAllMocks();
});

function createPool(): never {
  return { free: [] } as never;
}

function createState(): never {
  return { gl: {} } as never;
}

function createTarget(id: string): never {
  return { format: 'rgba8', height: 16, id, texture: {}, width: 32 } as never;
}

describe('registerGlLensDirtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensDirtEffect).toBeTypeOf('function');
  });
});
