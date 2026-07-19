import {
  applyWgpuEffectBlitOffsetPass,
  applyWgpuEffectBlitPass,
  applyWgpuEffectErasePass,
} from './wgpuEffectBlitShader';

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

describe('applyWgpuEffectErasePass', () => {
  it('is a function', () => {
    expect(typeof applyWgpuEffectErasePass).toBe('function');
  });
});
