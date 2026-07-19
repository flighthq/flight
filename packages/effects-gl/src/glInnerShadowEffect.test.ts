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
  applyGlEffectBlitOffsetPass: vi.fn(),
  applyGlEffectBlitPass: vi.fn(),
}));

vi.mock('./glEffectBoxBlur', () => ({
  applyGlEffectBoxBlur: vi.fn(),
}));

vi.mock('./glEffectTintShader', () => ({
  applyGlEffectInvertTintPass: vi.fn(),
}));

import { applyGlEffectBlitPass } from './glEffectBlitShader';
import { applyInnerShadowEffectToGl, defaultGlInnerShadowEffectRunner } from './glInnerShadowEffect';

describe('applyInnerShadowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInnerShadowEffectToGl).toBe('function');
  });

  it('composites the source before the clipped shadow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToGl(createState(), source, dest, createPool(), { kind: 'InnerShadowEffect' });

    expect(applyGlEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(applyGlEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      sourceMode: 'hide',
    });

    expect(applyGlEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultGlInnerShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInnerShadowEffectRunner).toBe('function');
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
