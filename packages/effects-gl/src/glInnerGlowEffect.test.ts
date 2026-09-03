import { createInnerGlowEffect } from '@flighthq/effects/contract';
import * as renderGlContract from '@flighthq/render-gl/contract';

import * as glEffectBlitShader from './glEffectBlitShader';
import * as glEffectBoxBlur from './glEffectBoxBlur';
import * as glEffectTintShader from './glEffectTintShader';
import {
  applyInnerGlowEffectToGl,
  defaultGlInnerGlowEffectRunner,
  registerGlInnerGlowEffect,
} from './glInnerGlowEffect';

let nextTargetId = 0;

beforeEach(() => {
  nextTargetId = 0;

  vi.spyOn(renderGlContract, 'acquireGlRenderTarget').mockImplementation(((
    _state: never,
    _pool: never,
    descriptor: never,
    _formatPolicy: never,
  ) => ({ ...(descriptor as Record<string, unknown>), id: `scratch-${nextTargetId++}`, texture: {} })) as never);
  vi.spyOn(renderGlContract, 'clearGlRenderTarget').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'compileGlFullscreenProgram').mockImplementation((() => ({
    program: {},
    vao: {},
  })) as never);
  vi.spyOn(renderGlContract, 'drawGlFullscreenPass').mockImplementation((() => {}) as never);
  vi.spyOn(renderGlContract, 'releaseGlRenderTarget').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBlitShader, 'applyGlEffectBlitPass').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectBoxBlur, 'applyGlEffectBoxBlur').mockImplementation((() => {}) as never);

  vi.spyOn(glEffectTintShader, 'applyGlEffectInvertTintPass').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyInnerGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInnerGlowEffectToGl).toBe('function');
  });

  it('composites the source before the clipped glow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), createInnerGlowEffect());

    expect(glEffectBlitShader.applyGlEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(glEffectBlitShader.applyGlEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), createInnerGlowEffect({ sourceMode: 'hide' }));

    expect(glEffectBlitShader.applyGlEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(glEffectBlitShader.applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    const finalComposite = vi.mocked(glEffectBlitShader.applyGlEffectBlitPass).mock.calls[0];
    expect(finalComposite[1]).not.toBe(source);
    expect(finalComposite[2]).toBe(dest);
  });

  it('uses an inverted exterior edge color for hidden-source blur', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToGl(
      createState(),
      source,
      dest,
      createPool(),
      createInnerGlowEffect({ color: 0xff0000ff, sourceMode: 'hide', strength: 2 }),
    );

    expect(glEffectBoxBlur.applyGlEffectBoxBlur).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ edgeColor: [1, 0, 0, 1] }),
    );
  });

  it('preserves the clipped glow pass when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');
    const sourceTexture = (source as unknown as { texture: unknown }).texture;

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), createInnerGlowEffect({ sourceMode: 'hide' }));

    expect(renderGlContract.drawGlFullscreenPass).toHaveBeenCalledTimes(1);
    expect(renderGlContract.drawGlFullscreenPass).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      [expect.anything(), sourceTexture],
      expect.anything(),
      expect.any(Function),
    );

    const gl = { ONE: 1, ZERO: 0, blendFunc: vi.fn() };
    const setClipUniforms = vi.mocked(renderGlContract.drawGlFullscreenPass).mock.calls[0][4];
    setClipUniforms(gl as never, {} as never);

    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ZERO);
  });
});

describe('defaultGlInnerGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInnerGlowEffectRunner).toBe('function');
  });
});

function createState(): never {
  return { gl: {} } as never;
}

function createPool(): never {
  return { free: [] } as never;
}

function createTarget(id: string): never {
  return { id, width: 32, height: 16, format: 'rgba8', texture: {} } as never;
}

describe('registerGlInnerGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlInnerGlowEffect).toBeTypeOf('function');
  });
});
