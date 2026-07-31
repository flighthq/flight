import type * as WgpueffectpassModule from './wgpuEffectPass';
import type * as WgpueffecttintshaderModule from './wgpuEffectTintShader';

// Mocked per file with doMock plus dynamic imports of the subject, not top-level hoisted vi.mock.
// The suite runs isolate:false over a shared module registry, so a hoisted mock is registered for
// every file in the worker rather than this one -- see the rule in the root vitest config.
let createWgpuDualSourceEffectPipeline: typeof WgpueffectpassModule.createWgpuDualSourceEffectPipeline;
let createWgpuEffectPipeline: typeof WgpueffectpassModule.createWgpuEffectPipeline;
let applyWgpuEffectInnerClipPass: typeof WgpueffecttintshaderModule.applyWgpuEffectInnerClipPass;
let applyWgpuEffectInvertTintPass: typeof WgpueffecttintshaderModule.applyWgpuEffectInvertTintPass;
let applyWgpuEffectTintPass: typeof WgpueffecttintshaderModule.applyWgpuEffectTintPass;

beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./wgpuEffectPass', () => ({
    createWgpuDualSourceEffectPipeline: vi.fn(() => ({ blendMode: 'replace', pipeline: {} })),
    createWgpuEffectPipeline: vi.fn(() => ({ blendMode: 'replace', pipeline: {} })),
    drawWgpuDualSourceEffectPass: vi.fn(),
    drawWgpuEffectPass: vi.fn(),
  }));
  ({ createWgpuDualSourceEffectPipeline, createWgpuEffectPipeline } = await import('./wgpuEffectPass'));
  ({ applyWgpuEffectInnerClipPass, applyWgpuEffectInvertTintPass, applyWgpuEffectTintPass } =
    await import('./wgpuEffectTintShader'));
});

describe('applyWgpuEffectInnerClipPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInnerClipPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectInnerClipPass(createState(), createTarget(), createTarget(), createTarget());

    expect(createWgpuDualSourceEffectPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'replace');
  });
});

describe('applyWgpuEffectInvertTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInvertTintPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectInvertTintPass(createState(), createTarget(), createTarget(), 0xff00cc, 0.5, 2);

    expect(createWgpuEffectPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'replace');
  });
});

describe('applyWgpuEffectTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectTintPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectTintPass(createState(), createTarget(), createTarget(), 0xff00cc, 0.5, 2);

    expect(createWgpuEffectPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'replace');
  });
});

afterAll(() => {
  vi.doUnmock('./wgpuEffectPass');
  vi.resetModules();
});

function createState(): never {
  return {} as never;
}

function createTarget(): never {
  return {} as never;
}
