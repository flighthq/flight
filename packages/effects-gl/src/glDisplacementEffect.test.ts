import { applyDisplacementEffectToGl, defaultGlDisplacementEffectRunner } from './glDisplacementEffect';

describe('applyDisplacementEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToGl).toBe('function');
  });
});

describe('defaultGlDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDisplacementEffectRunner).toBe('function');
  });
});
