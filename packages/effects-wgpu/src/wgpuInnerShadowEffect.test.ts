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
  applyWgpuEffectBlitOffsetPass: vi.fn(),
  applyWgpuEffectBlitPass: vi.fn(),
}));

vi.mock('./wgpuEffectBoxBlur', () => ({
  applyWgpuEffectBoxBlur: vi.fn(),
}));

vi.mock('./wgpuEffectPass', () => ({
  clearWgpuEffectTarget: vi.fn(),
}));

vi.mock('./wgpuEffectTintShader', () => ({
  applyWgpuEffectInnerClipPass: vi.fn(),
  applyWgpuEffectInvertTintPass: vi.fn(),
}));

import { applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';
import { applyInnerShadowEffectToWgpu, defaultWgpuInnerShadowEffectRunner } from './wgpuInnerShadowEffect';

describe('applyInnerShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInnerShadowEffectToWgpu).toBe('function');
  });

  it('composites the source before the clipped shadow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'InnerShadowEffect' });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(applyWgpuEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when hideObject is true', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      hideObject: true,
    });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
  });

  it('omits the source composite when knockout is true', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      knockout: true,
    });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuInnerShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInnerShadowEffectRunner).toBe('function');
  });
});

beforeEach(() => {
  vi.clearAllMocks();
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
