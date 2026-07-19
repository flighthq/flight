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
import { applyInnerGlowEffectToWgpu, defaultWgpuInnerGlowEffectRunner } from './wgpuInnerGlowEffect';

describe('applyInnerGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInnerGlowEffectToWgpu).toBe('function');
  });

  it('composites the source before the clipped glow by default', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'InnerGlowEffect' });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(2);
    expect(applyWgpuEffectBlitPass).toHaveBeenNthCalledWith(1, expect.anything(), source, dest);
  });

  it('omits the source composite when knockout is true', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerGlowEffectToWgpu(createState(), source, dest, createPool(), { kind: 'InnerGlowEffect', knockout: true });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
  });
});

describe('defaultWgpuInnerGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInnerGlowEffectRunner).toBe('function');
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
