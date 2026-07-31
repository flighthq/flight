import {
  applyScanlinesEffectToGl,
  defaultGlScanlinesEffectRunner,
  registerGlScanlinesEffect,
} from './glScanlinesEffect';

describe('applyScanlinesEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToGl).toBe('function');
  });
});

describe('defaultGlScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlScanlinesEffectRunner).toBe('function');
  });
});

describe('registerGlScanlinesEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlScanlinesEffect).toBeTypeOf('function');
  });
});
