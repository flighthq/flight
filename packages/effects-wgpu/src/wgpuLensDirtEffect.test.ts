import * as renderWgpuContractModule from '@flighthq/render-wgpu/contract';

import * as wgpuBlurEffectModule from './wgpuBlurEffect';
import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectProgramCacheModule from './wgpuEffectProgramCache';
import {
  applyLensDirtEffectToWgpu,
  defaultWgpuLensDirtEffectRunner,
  registerWgpuLensDirtEffect,
} from './wgpuLensDirtEffect';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(renderWgpuContractModule, 'acquireWgpuRenderTarget').mockImplementation(((
    _state: never,
    _pool: never,
    descriptor: never,
  ) => ({
    ...(descriptor as object),
    id: `scratch-${nextTargetId++}`,
    texture: {},
  })) as never);
  vi.spyOn(renderWgpuContractModule, 'releaseWgpuRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuBlurEffectModule, 'applyGaussianBlurToWgpu').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectPassModule, 'createWgpuDualSourceEffectPipeline').mockReturnValue({ pipeline: {} } as never);
  vi.spyOn(wgpuEffectPassModule, 'drawWgpuDualSourceEffectPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectPassModule, 'drawWgpuEffectPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectProgramCacheModule, 'getWgpuEffectPipeline').mockImplementation(((_state: never, key: string) => ({
    key,
  })) as never);
});

afterEach(() => vi.restoreAllMocks());

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

    expect(renderWgpuContractModule.acquireWgpuRenderTarget).toHaveBeenCalledTimes(3);
    const [bright, blurred, temp] = vi
      .mocked(renderWgpuContractModule.acquireWgpuRenderTarget)
      .mock.results.map((result) => result.value!);
    expect(wgpuEffectProgramCacheModule.getWgpuEffectPipeline).toHaveBeenCalledWith(
      state,
      'lens.lensDirt.bright',
      expect.any(String),
      'replace',
    );
    expect(wgpuEffectPassModule.drawWgpuEffectPass).toHaveBeenCalledWith(
      state,
      source,
      bright,
      expect.anything(),
      expect.any(Function),
    );
    expect(wgpuBlurEffectModule.applyGaussianBlurToWgpu).toHaveBeenCalledWith(state, bright, blurred, temp, {
      blurX: 8,
      blurY: 8,
    });
    expect(wgpuEffectPassModule.createWgpuDualSourceEffectPipeline).toHaveBeenCalledWith(
      state,
      expect.any(String),
      'replace',
    );
    expect(wgpuEffectPassModule.drawWgpuDualSourceEffectPass).toHaveBeenCalledWith(
      state,
      source,
      blurred,
      dest,
      expect.anything(),
      expect.any(Function),
    );
    expect(renderWgpuContractModule.releaseWgpuRenderTarget).toHaveBeenNthCalledWith(1, pool, bright);
    expect(renderWgpuContractModule.releaseWgpuRenderTarget).toHaveBeenNthCalledWith(2, pool, blurred);
    expect(renderWgpuContractModule.releaseWgpuRenderTarget).toHaveBeenNthCalledWith(3, pool, temp);

    const brightUniforms = new Float32Array(4);
    vi.mocked(wgpuEffectPassModule.drawWgpuEffectPass).mock.calls[0]![4](
      brightUniforms,
      new Int32Array(brightUniforms.buffer),
    );
    expect(brightUniforms[0]).toBeCloseTo(0.45);
    expect([...brightUniforms.slice(1)]).toEqual([0, 0, 0]);
    const compositeUniforms = new Float32Array(4);
    vi.mocked(wgpuEffectPassModule.drawWgpuDualSourceEffectPass).mock.calls[0]![5](
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
