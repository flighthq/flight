import { applyTaaEffectToGl, defaultGlTaaEffectRunner, registerGlTaaEffect } from './glTaaEffect';

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

describe('registerGlTaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlTaaEffect).toBeTypeOf('function');
  });
});
