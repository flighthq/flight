import { applyGlEffectBlitOffsetPass, applyGlEffectBlitPass, applyGlEffectErasePass } from './glEffectBlitShader';

describe('applyGlEffectBlitOffsetPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectBlitOffsetPass).toBe('function');
  });
});

describe('applyGlEffectBlitPass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectBlitPass).toBe('function');
  });
});

describe('applyGlEffectErasePass', () => {
  it('is a function', () => {
    expect(typeof applyGlEffectErasePass).toBe('function');
  });
});
