import * as renderWgpuContract from '@flighthq/render-wgpu/contract';

import {
  applyDropShadowEffectToWgpu,
  defaultWgpuDropShadowEffectRunner,
  registerWgpuDropShadowEffect,
} from './wgpuDropShadowEffect';
import * as wgpuEffectBlitShaderMod from './wgpuEffectBlitShader';
import * as wgpuEffectBoxBlurMod from './wgpuEffectBoxBlur';
import * as wgpuEffectPassMod from './wgpuEffectPass';
import * as wgpuEffectTintShaderMod from './wgpuEffectTintShader';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(renderWgpuContract, 'acquireWgpuRenderTarget').mockImplementation(((
    _state: unknown,
    _pool: unknown,
    descriptor: Record<string, unknown>,
  ) => ({
    ...descriptor,
    id: `scratch-${nextTargetId++}`,
    texture: {},
  })) as never);
  vi.spyOn(renderWgpuContract, 'releaseWgpuRenderTarget').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectBlitShaderMod, 'applyWgpuEffectBlitOffsetPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectBlitShaderMod, 'applyWgpuEffectBlitPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectBlitShaderMod, 'applyWgpuEffectErasePass').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectBoxBlurMod, 'applyWgpuEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectPassMod, 'clearWgpuEffectTarget').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectTintShaderMod, 'applyWgpuEffectTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

describe('applyDropShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToWgpu).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'DropShadowEffect' });

    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(wgpuEffectBlitShaderMod.applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'hide',
    });

    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(wgpuEffectBlitShaderMod.applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'knockout',
    });

    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(wgpuEffectBlitShaderMod.applyWgpuEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDropShadowEffectRunner).toBe('function');
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

describe('registerWgpuDropShadowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDropShadowEffect).toBeTypeOf('function');
  });
});
