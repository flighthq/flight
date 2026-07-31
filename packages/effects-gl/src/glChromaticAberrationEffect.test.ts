import {
  applyChromaticAberrationEffectToGl,
  defaultGlChromaticAberrationEffectRunner,
  registerGlChromaticAberrationEffect,
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

describe('registerGlChromaticAberrationEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlChromaticAberrationEffect).toBeTypeOf('function');
  });
});
