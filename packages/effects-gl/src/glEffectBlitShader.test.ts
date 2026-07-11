import { applyGlEffectBlitOffsetPass, applyGlEffectBlitPass } from './glEffectBlitShader';

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
