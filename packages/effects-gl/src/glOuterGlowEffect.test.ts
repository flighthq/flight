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
    releaseGlRenderTarget: vi.fn(),
  };
});

vi.mock('./glEffectBlitShader', () => ({
  applyGlEffectBlitPass: vi.fn(),
  applyGlEffectErasePass: vi.fn(),
}));

vi.mock('./glEffectBoxBlur', () => ({
  applyGlEffectBoxBlur: vi.fn(),
}));

vi.mock('./glEffectTintShader', () => ({
  applyGlEffectTintPass: vi.fn(),
}));

import { applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';
import { applyOuterGlowEffectToGl, defaultGlOuterGlowEffectRunner } from './glOuterGlowEffect';

describe('applyOuterGlowEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToGl).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), { kind: 'OuterGlowEffect' });

    expect(applyGlEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'hide',
    });

    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToGl(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'knockout',
    });

    expect(applyGlEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyGlEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultGlOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlOuterGlowEffectRunner).toBe('function');
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
