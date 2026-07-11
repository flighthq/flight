import { applyWgpuEffectBlitOffsetPass, applyWgpuEffectBlitPass } from './wgpuEffectBlitShader';

describe('applyWgpuEffectBlitOffsetPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectBlitOffsetPass).toBe('function');
  });
});

describe('applyWgpuEffectBlitPass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectBlitPass).toBe('function');
  });
});
