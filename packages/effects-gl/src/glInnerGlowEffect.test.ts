vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('@flighthq/render-gl', () => {
  let nextTargetId = 0;
  return {
    acquireGlRenderTarget: vi.fn((_state, _pool, descriptor) => ({
      ...descriptor,
      id: `scratch-${nextTargetId++}`,
      texture: {},
    })),
    clearGlRenderTarget: vi.fn(),
    compileGlFullscreenProgram: vi.fn(() => ({ program: {}, vao: {} })),
    drawGlFullscreenPass: vi.fn(),
    releaseGlRenderTarget: vi.fn(),
  };
});

vi.mock('./glEffectBlitShader', () => ({
  applyGlEffectBlitPass: vi.fn(),
}));

vi.mock('./glEffectBoxBlur', () => ({
  applyGlEffectBoxBlur: vi.fn(),
}));

vi.mock('./glEffectTintShader', () => ({
  applyGlEffectInvertTintPass: vi.fn(),
}));

import { drawGlFullscreenPass } from '@flighthq/render-gl';

import { applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyInnerGlowEffectToGl, defaultGlInnerGlowEffectRunner } from './glInnerGlowEffect';

describe('applyInnerGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInnerGlowEffectToGl).toBe('function');
  });

  it('composites the source before the clipped glow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), { kind: 'InnerGlowEffect' });

    expect(applyGlEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(applyGlEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'InnerGlowEffect',
      sourceMode: 'hide',
    });

    expect(applyGlEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    const finalComposite = vi.mocked(applyGlEffectBlitPass).mock.calls[0];
    expect(finalComposite[1]).not.toBe(source);
    expect(finalComposite[2]).toBe(dest);
  });

  it('preserves the clipped glow pass when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');
    const sourceTexture = (source as unknown as { texture: unknown }).texture;

    applyInnerGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'InnerGlowEffect',
      sourceMode: 'hide',
    });

    expect(drawGlFullscreenPass).toHaveBeenCalledTimes(1);
    expect(drawGlFullscreenPass).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.anything(),
      [expect.anything(), sourceTexture],
      expect.anything(),
      expect.any(Function),
    );

    const gl = { ONE: 1, ZERO: 0, blendFunc: vi.fn() };
    const setClipUniforms = vi.mocked(drawGlFullscreenPass).mock.calls[0][4];
    setClipUniforms(gl as never, {} as never);

    expect(gl.blendFunc).toHaveBeenCalledWith(gl.ONE, gl.ZERO);
  });
});

describe('defaultGlInnerGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInnerGlowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.doUnmock('@flighthq/render-gl');
  vi.doUnmock('./glEffectBlitShader');
  vi.doUnmock('./glEffectBoxBlur');
  vi.doUnmock('./glEffectTintShader');
  vi.resetModules();
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
