import {
  applyChromaticAberrationEffectToGl,
  defaultGlChromaticAberrationEffectRunner,
} from './glChromaticAberrationEffect';

describe('applyChromaticAberrationEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToGl).toBe('function');
  });
});

describe('defaultGlChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlChromaticAberrationEffectRunner).toBe('function');
  });
});
