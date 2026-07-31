import { applyCrtEffectToGl, defaultGlCrtEffectRunner, registerGlCrtEffect } from './glCrtEffect';

describe('applyCrtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToGl).toBe('function');
  });
});

describe('defaultGlCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCrtEffectRunner).toBe('function');
  });
});

describe('registerGlCrtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlCrtEffect).toBeTypeOf('function');
  });
});
