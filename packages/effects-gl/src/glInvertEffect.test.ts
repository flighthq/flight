import { applyInvertEffectToGl, defaultGlInvertEffectRunner } from './glInvertEffect';

describe('applyInvertEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyInvertEffectToGl).toBe('function');
  });
});

describe('defaultGlInvertEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlInvertEffectRunner).toBe('function');
  });
});
