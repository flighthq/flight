import * as wgpuEffectPassMod from './wgpuEffectPass';
import {
  applyWgpuEffectInnerClipPass,
  applyWgpuEffectInvertTintPass,
  applyWgpuEffectTintPass,
} from './wgpuEffectTintShader';

beforeEach(() => {
  vi.spyOn(wgpuEffectPassMod, 'createWgpuDualSourceEffectPipeline').mockReturnValue({
    blendMode: 'replace',
    pipeline: {},
  } as never);
  vi.spyOn(wgpuEffectPassMod, 'createWgpuEffectPipeline').mockReturnValue({
    blendMode: 'replace',
    pipeline: {},
  } as never);
  vi.spyOn(wgpuEffectPassMod, 'drawWgpuDualSourceEffectPass').mockImplementation((() => {}) as never);
  vi.spyOn(wgpuEffectPassMod, 'drawWgpuEffectPass').mockImplementation((() => {}) as never);
});

afterEach(() => vi.restoreAllMocks());

describe('applyWgpuEffectInnerClipPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInnerClipPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectInnerClipPass(createState(), createTarget(), createTarget(), createTarget());

    expect(wgpuEffectPassMod.createWgpuDualSourceEffectPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'replace',
    );
  });
});

describe('applyWgpuEffectInvertTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInvertTintPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectInvertTintPass(createState(), createTarget(), createTarget(), 0xff00cc, 0.5, 2);

    expect(wgpuEffectPassMod.createWgpuEffectPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'replace',
    );
  });
});

describe('applyWgpuEffectTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectTintPass).toBe('function');
  });

  it('uses replacement blending', () => {
    applyWgpuEffectTintPass(createState(), createTarget(), createTarget(), 0xff00cc, 0.5, 2);

    expect(wgpuEffectPassMod.createWgpuEffectPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'replace',
    );
  });
});

function createState(): never {
  return {} as never;
}

function createTarget(): never {
  return {} as never;
}
