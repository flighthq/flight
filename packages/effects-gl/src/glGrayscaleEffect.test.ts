import { applyGrayscaleEffectToGl, defaultGlGrayscaleEffectRunner } from './glGrayscaleEffect';

describe('applyGrayscaleEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGrayscaleEffectToGl).toBe('function');
  });
});

describe('defaultGlGrayscaleEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGrayscaleEffectRunner).toBe('function');
  });
});
