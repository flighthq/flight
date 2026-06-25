import { applyToneMapEffectToGl, defaultGlToneMapEffectRunner } from './glToneMapEffect';

describe('applyToneMapEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToGl).toBe('function');
  });
});

describe('defaultGlToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlToneMapEffectRunner).toBe('function');
  });
});
