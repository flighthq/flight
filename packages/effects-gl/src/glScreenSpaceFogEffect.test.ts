import {
  applyScreenSpaceFogEffectToGl,
  defaultGlScreenSpaceFogEffectRunner,
  registerGlScreenSpaceFogEffect,
} from './glScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToGl).toBe('function');
  });
});

describe('defaultGlScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('registerGlScreenSpaceFogEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlScreenSpaceFogEffect).toBeTypeOf('function');
  });
});
