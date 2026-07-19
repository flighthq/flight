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
