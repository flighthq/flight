import * as renderWgpuContractModule from '@flighthq/render-wgpu/contract';

import * as wgpuEffectBlitShaderModule from './wgpuEffectBlitShader';
import * as wgpuEffectBoxBlurModule from './wgpuEffectBoxBlur';
import * as wgpuEffectPassModule from './wgpuEffectPass';
import * as wgpuEffectTintShaderModule from './wgpuEffectTintShader';
import {
  applyOuterGlowEffectToWgpu,
  defaultWgpuOuterGlowEffectRunner,
  registerWgpuOuterGlowEffect,
} from './wgpuOuterGlowEffect';

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
  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectBlitPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectBlitShaderModule, 'applyWgpuEffectErasePass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectBoxBlurModule, 'applyWgpuEffectBoxBlur').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectPassModule, 'clearWgpuEffectTarget').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectTintShaderModule, 'applyWgpuEffectTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

describe('applyOuterGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToWgpu).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'OuterGlowEffect' });

    expect(wgpuEffectBlitShaderModule.applyWgpuEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(wgpuEffectBlitShaderModule.applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'hide',
    });

    expect(wgpuEffectBlitShaderModule.applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(
      expect.anything(),
      source,
      dest,
    );
    expect(wgpuEffectBlitShaderModule.applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'knockout',
    });

    expect(wgpuEffectBlitShaderModule.applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(
      expect.anything(),
      source,
      dest,
    );
    expect(wgpuEffectBlitShaderModule.applyWgpuEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuOuterGlowEffectRunner).toBe('function');
  });
});

function createState(): never {
  return {} as never;
}

function createPool(): never {
  return { free: [] } as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {} } as never;
}

describe('registerWgpuOuterGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuOuterGlowEffect).toBeTypeOf('function');
  });
});
