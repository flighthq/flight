import { applySmaaEffectToGl, defaultGlSmaaEffectRunner } from './glSmaaEffect';

describe('applySmaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToGl).toBe('function');
  });
});

describe('defaultGlSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSmaaEffectRunner).toBe('function');
  });
});
