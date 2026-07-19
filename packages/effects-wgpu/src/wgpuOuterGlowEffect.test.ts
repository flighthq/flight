vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('@flighthq/render-wgpu', () => {
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

vi.mock('./wgpuEffectBlitShader', () => ({
  applyWgpuEffectBlitPass: vi.fn(),
  applyWgpuEffectErasePass: vi.fn(),
}));

vi.mock('./wgpuEffectBoxBlur', () => ({
  applyWgpuEffectBoxBlur: vi.fn(),
}));

vi.mock('./wgpuEffectPass', () => ({
  clearWgpuEffectTarget: vi.fn(),
}));

vi.mock('./wgpuEffectTintShader', () => ({
  applyWgpuEffectTintPass: vi.fn(),
}));

import { applyWgpuEffectBlitPass, applyWgpuEffectErasePass } from './wgpuEffectBlitShader';
import { applyOuterGlowEffectToWgpu, defaultWgpuOuterGlowEffectRunner } from './wgpuOuterGlowEffect';

describe('applyOuterGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToWgpu).toBe('function');
  });

  it('draws the source by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'OuterGlowEffect' });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('hides the source when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'hide',
    });

    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).not.toHaveBeenCalled();
  });

  it('erases the source silhouette when sourceMode is knockout', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyOuterGlowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'OuterGlowEffect',
      sourceMode: 'knockout',
    });

    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    expect(applyWgpuEffectErasePass).toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuOuterGlowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.doUnmock('@flighthq/render-wgpu');
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
