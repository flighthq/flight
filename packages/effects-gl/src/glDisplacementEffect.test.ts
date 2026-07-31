import {
  applyDisplacementEffectToGl,
  defaultGlDisplacementEffectRunner,
  registerGlDisplacementEffect,
} from './glDisplacementEffect';

describe('applyDisplacementEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToGl).toBe('function');
  });
});

describe('defaultGlDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDisplacementEffectRunner).toBe('function');
  });
});

describe('registerGlDisplacementEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlDisplacementEffect).toBeTypeOf('function');
  });
});
