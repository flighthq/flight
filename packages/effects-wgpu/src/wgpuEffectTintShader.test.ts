import {
  applyWgpuEffectInnerClipPass,
  applyWgpuEffectInvertTintPass,
  applyWgpuEffectTintPass,
} from './wgpuEffectTintShader';

describe('applyWgpuEffectInnerClipPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInnerClipPass).toBe('function');
  });
});

describe('applyWgpuEffectInvertTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectInvertTintPass).toBe('function');
  });
});

describe('applyWgpuEffectTintPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectTintPass).toBe('function');
  });
});
