vi.mock('@flighthq/render-wgpu/contract', () => {
  let nextTargetId = 0;
  return {
    acquireWgpuRenderTarget: vi.fn((_state, _pool, descriptor) => ({
      ...descriptor,
      id: `scratch-${nextTargetId++}`,
      texture: {},
    })),
    releaseWgpuRenderTarget: vi.fn(),
  };
});

vi.mock('./wgpuBlurEffect', () => ({
  applyGaussianBlurToWgpu: vi.fn(),
}));

vi.mock('./wgpuEffectPass', () => ({
  createWgpuDualSourceEffectPipeline: vi.fn(() => ({ pipeline: {} })),
  drawWgpuDualSourceEffectPass: vi.fn(),
  drawWgpuEffectPass: vi.fn(),
}));

vi.mock('./wgpuEffectProgramCache', () => ({
  getWgpuEffectPipeline: vi.fn((_state, key) => ({ key })),
}));

import { acquireWgpuRenderTarget, releaseWgpuRenderTarget } from '@flighthq/render-wgpu/contract';

import { applyGaussianBlurToWgpu } from './wgpuBlurEffect';
import { createWgpuDualSourceEffectPipeline, drawWgpuDualSourceEffectPass, drawWgpuEffectPass } from './wgpuEffectPass';
import { getWgpuEffectPipeline } from './wgpuEffectProgramCache';
import {
  applyLensDirtEffectToWgpu,
  defaultWgpuLensDirtEffectRunner,
  registerWgpuLensDirtEffect,
} from './wgpuLensDirtEffect';

describe('applyLensDirtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToWgpu).toBe('function');
  });

  it('blurs a thresholded bright branch before the dirt-modulated composite', () => {
    const state = createState();
    const source = createTarget('source');
    const dest = createTarget('dest');
    const pool = createPool();

    applyLensDirtEffectToWgpu(state, source, dest, pool, {
      intensity: 1.5,
      kind: 'LensDirtEffect',
      seed: 4,
      threshold: 0.45,
    });

    expect(acquireWgpuRenderTarget).toHaveBeenCalledTimes(3);
    const [bright, blurred, temp] = vi.mocked(acquireWgpuRenderTarget).mock.results.map((result) => result.value!);
    expect(getWgpuEffectPipeline).toHaveBeenCalledWith(state, 'lens.lensDirt.bright', expect.any(String), 'replace');
    expect(drawWgpuEffectPass).toHaveBeenCalledWith(state, source, bright, expect.anything(), expect.any(Function));
    expect(applyGaussianBlurToWgpu).toHaveBeenCalledWith(state, bright, blurred, temp, { blurX: 8, blurY: 8 });
    expect(createWgpuDualSourceEffectPipeline).toHaveBeenCalledWith(state, expect.any(String), 'replace');
    expect(drawWgpuDualSourceEffectPass).toHaveBeenCalledWith(
      state,
      source,
      blurred,
      dest,
      expect.anything(),
      expect.any(Function),
    );
    expect(releaseWgpuRenderTarget).toHaveBeenNthCalledWith(1, pool, bright);
    expect(releaseWgpuRenderTarget).toHaveBeenNthCalledWith(2, pool, blurred);
    expect(releaseWgpuRenderTarget).toHaveBeenNthCalledWith(3, pool, temp);

    const brightUniforms = new Float32Array(4);
    vi.mocked(drawWgpuEffectPass).mock.calls[0]![4](brightUniforms, new Int32Array(brightUniforms.buffer));
    expect(brightUniforms[0]).toBeCloseTo(0.45);
    expect([...brightUniforms.slice(1)]).toEqual([0, 0, 0]);
    const compositeUniforms = new Float32Array(4);
    vi.mocked(drawWgpuDualSourceEffectPass).mock.calls[0]![5](
      compositeUniforms,
      new Int32Array(compositeUniforms.buffer),
    );
    expect([...compositeUniforms]).toEqual([1.5, 4, 0, 0]);
  });
});

describe('defaultWgpuLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLensDirtEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

function createPool(): never {
  return { free: [] } as never;
}

function createState(): never {
  return {} as never;
}

function createTarget(id: string): never {
  return { format: 'rgba8', height: 16, id, texture: {}, width: 32 } as never;
}

describe('registerWgpuLensDirtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensDirtEffect).toBeTypeOf('function');
  });
});
