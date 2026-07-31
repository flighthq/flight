import type * as WgpudropshadoweffectModule from './wgpuDropShadowEffect';
import type * as WgpueffectblitshaderModule from './wgpuEffectBlitShader';

// Mocked per file with doMock plus dynamic imports of the subject, not top-level hoisted vi.mock.
// The suite runs isolate:false over a shared module registry, so a hoisted mock is registered for
// every file in the worker rather than this one -- see the rule in the root vitest config.
let applyDropShadowEffectToWgpu: typeof WgpudropshadoweffectModule.applyDropShadowEffectToWgpu;
let defaultWgpuDropShadowEffectRunner: typeof WgpudropshadoweffectModule.defaultWgpuDropShadowEffectRunner;
let applyWgpuEffectBlitPass: typeof WgpueffectblitshaderModule.applyWgpuEffectBlitPass;
let applyWgpuEffectErasePass: typeof WgpueffectblitshaderModule.applyWgpuEffectErasePass;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('@flighthq/render-wgpu/contract', () => {
    let nextTargetId = 0;
    return {
      acquireWgpuRenderTarget: vi.fn((_state, _pool, descriptor) => ({
        ...descriptor,
        id: `scratch-${nextTargetId++}`,
        texture: {},
      })),
      releaseWgpuRenderTarget: vi.fn(),
    };
  });
  vi.doMock('./wgpuEffectBlitShader', () => ({
    applyWgpuEffectBlitOffsetPass: vi.fn(),
    applyWgpuEffectBlitPass: vi.fn(),
    applyWgpuEffectErasePass: vi.fn(),
  }));
  vi.doMock('./wgpuEffectBoxBlur', () => ({
    applyWgpuEffectBoxBlur: vi.fn(),
  }));
  vi.doMock('./wgpuEffectPass', () => ({
    clearWgpuEffectTarget: vi.fn(),
  }));
  vi.doMock('./wgpuEffectTintShader', () => ({
    applyWgpuEffectTintPass: vi.fn(),
  }));
  ({ applyDropShadowEffectToWgpu, defaultWgpuDropShadowEffectRunner } = await import('./wgpuDropShadowEffect'));
  ({ applyWgpuEffectBlitPass, applyWgpuEffectErasePass } = await import('./wgpuEffectBlitShader'));
});

describe('applyDropShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToWgpu).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'DropShadowEffect' });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'hide',
    });

    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyDropShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'DropShadowEffect',
      sourceMode: 'knockout',
    });

    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDropShadowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.doUnmock('@flighthq/render-wgpu/contract');
  vi.doUnmock('./wgpuEffectBlitShader');
  vi.doUnmock('./wgpuEffectBoxBlur');
  vi.doUnmock('./wgpuEffectPass');
  vi.doUnmock('./wgpuEffectTintShader');
  vi.resetModules();
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
