import { applyTaaEffectToGl, defaultGlTaaEffectRunner } from './glTaaEffect';

describe('applyTaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToGl).toBe('function');
  });
});

describe('defaultGlTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlTaaEffectRunner).toBe('function');
  });
});
