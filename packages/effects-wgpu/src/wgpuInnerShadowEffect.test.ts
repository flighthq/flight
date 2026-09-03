import { createInnerShadowEffect } from '@flighthq/effects/contract';
import * as renderWgpuContract from '@flighthq/render-wgpu/contract';

import * as wgpuEffectBlitShaderMod from './wgpuEffectBlitShader';
import * as wgpuEffectBoxBlurMod from './wgpuEffectBoxBlur';
import * as wgpuEffectPassMod from './wgpuEffectPass';
import * as wgpuEffectTintShaderMod from './wgpuEffectTintShader';
import {
  applyInnerShadowEffectToWgpu,
  defaultWgpuInnerShadowEffectRunner,
  registerWgpuInnerShadowEffect,
} from './wgpuInnerShadowEffect';

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

  vi.spyOn(wgpuEffectBoxBlurMod, 'applyWgpuEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectPassMod, 'clearWgpuEffectTarget').mockImplementation((() => {}) as never);

  vi.spyOn(wgpuEffectTintShaderMod, 'applyWgpuEffectInnerClipPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectTintShaderMod, 'applyWgpuEffectInvertTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

describe('applyInnerShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInnerShadowEffectToWgpu).toBe('function');
  });

  it('composites the source before the clipped shadow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), createInnerShadowEffect());

    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(
      createState(),
      source,
      dest,
      createPool(),
      createInnerShadowEffect({
        sourceMode: 'hide',
      }),
    );

    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    const finalComposite = vi.mocked(wgpuEffectBlitShaderMod.applyWgpuEffectBlitPass).mock.calls[0];
    expect(finalComposite[1]).not.toBe(source);
    expect(finalComposite[2]).toBe(dest);
  });

  it('uses an inverted exterior edge color for hidden-source blur', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(
      createState(),
      source,
      dest,
      createPool(),
      createInnerShadowEffect({
        color: 0x000000ff,
        sourceMode: 'hide',
      }),
    );

    expect(wgpuEffectBoxBlurMod.applyWgpuEffectBoxBlur).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ edgeColor: [0, 0, 0, 1] }),
    );
  });

  it('clips the hidden-source shadow against the source alpha', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(
      createState(),
      source,
      dest,
      createPool(),
      createInnerShadowEffect({
        sourceMode: 'hide',
      }),
    );

    expect(wgpuEffectTintShaderMod.applyWgpuEffectInnerClipPass).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      source,
      expect.anything(),
    );
  });
});

describe('defaultWgpuInnerShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInnerShadowEffectRunner).toBe('function');
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

describe('registerWgpuInnerShadowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuInnerShadowEffect).toBeTypeOf('function');
  });
});
