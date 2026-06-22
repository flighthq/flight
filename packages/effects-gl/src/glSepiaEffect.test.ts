import { applySepiaEffectToGl, defaultGlSepiaEffectRunner } from './glSepiaEffect';

describe('applySepiaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySepiaEffectToGl).toBe('function');
  });
});

describe('defaultGlSepiaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSepiaEffectRunner).toBe('function');
  });
});
