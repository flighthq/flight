import { applySharpenEffectToGl, defaultGlSharpenEffectRunner } from './glSharpenEffect';

describe('applySharpenEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToGl).toBe('function');
  });
});

describe('defaultGlSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSharpenEffectRunner).toBe('function');
  });
});
