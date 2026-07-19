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
import { applyWgpuEffectBoxBlur } from './wgpuEffectBoxBlur';
import { applyWgpuEffectInnerClipPass } from './wgpuEffectTintShader';
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

  it('omits the source composite when sourceMode is hide', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      sourceMode: 'hide',
    });

    expect(applyWgpuEffectBlitPass).toHaveBeenCalledTimes(1);
    expect(applyWgpuEffectBlitPass).not.toHaveBeenCalledWith(expect.anything(), source, dest);
    const finalComposite = vi.mocked(applyWgpuEffectBlitPass).mock.calls[0];
    expect(finalComposite[1]).not.toBe(source);
    expect(finalComposite[2]).toBe(dest);
  });

  it('uses an inverted exterior edge color for hidden-source blur', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      color: 0,
      sourceMode: 'hide',
    });

    expect(applyWgpuEffectBoxBlur).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ edgeColor: [0, 0, 0, 1] }),
    );
  });

  it('clips the hidden-source shadow against the source alpha', () => {
    const source = createTarget('source');
    const dest = createTarget('dest');

    applyInnerShadowEffectToWgpu(createState(), source, dest, createPool(), {
      kind: 'InnerShadowEffect',
      sourceMode: 'hide',
    });

    expect(applyWgpuEffectInnerClipPass).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      source,
      expect.anything(),
    );
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
