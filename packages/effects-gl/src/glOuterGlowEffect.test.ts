import type * as GleffectblitshaderModule from './glEffectBlitShader';
import type * as GloutergloweffectModule from './glOuterGlowEffect';

// Mocked per file with doMock plus dynamic imports of the subject, not top-level hoisted vi.mock.
// The suite runs isolate:false over a shared module registry, so a hoisted mock is registered for
// every file in the worker rather than this one -- see the rule in the root vitest config.
let applyGlEffectBlitPass: typeof GleffectblitshaderModule.applyGlEffectBlitPass;
let applyGlEffectErasePass: typeof GleffectblitshaderModule.applyGlEffectErasePass;
let applyOuterGlowEffectToGl: typeof GloutergloweffectModule.applyOuterGlowEffectToGl;
let defaultGlOuterGlowEffectRunner: typeof GloutergloweffectModule.defaultGlOuterGlowEffectRunner;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('@flighthq/render-gl/contract', () => {
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
  vi.doMock('./glEffectBlitShader', () => ({
    applyGlEffectBlitPass: vi.fn(),
    applyGlEffectErasePass: vi.fn(),
  }));
  vi.doMock('./glEffectBoxBlur', () => ({
    applyGlEffectBoxBlur: vi.fn(),
  }));
  vi.doMock('./glEffectTintShader', () => ({
    applyGlEffectTintPass: vi.fn(),
  }));
  ({ applyGlEffectBlitPass, applyGlEffectErasePass } = await import('./glEffectBlitShader'));
  ({ applyOuterGlowEffectToGl, defaultGlOuterGlowEffectRunner } = await import('./glOuterGlowEffect'));
});

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
  vi.doUnmock('@flighthq/render-gl/contract');
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
