vi.hoisted(() => {
  vi.resetModules();
});

vi.mock('./wgpuEffectPass', () => ({
  createWgpuDualSourceEffectPipeline: vi.fn(() => ({ blendMode: 'replace', pipeline: {} })),
  createWgpuEffectPipeline: vi.fn(() => ({ blendMode: 'replace', pipeline: {} })),
  drawWgpuDualSourceEffectPass: vi.fn(),
  drawWgpuEffectPass: vi.fn(),
}));

import { createWgpuDualSourceEffectPipeline, createWgpuEffectPipeline } from './wgpuEffectPass';
import {
  applyWgpuEffectInnerClipPass,
  applyWgpuEffectInvertTintPass,
  applyWgpuEffectTintPass,
} from './wgpuEffectTintShader';

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
