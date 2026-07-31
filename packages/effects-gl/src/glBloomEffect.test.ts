import { applyBloomEffectToGl, defaultGlBloomEffectRunner, registerGlBloomEffect } from './glBloomEffect';

describe('applyBloomEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToGl).toBe('function');
  });
});

describe('defaultGlBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBloomEffectRunner).toBe('function');
  });
});

describe('registerGlBloomEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBloomEffect).toBeTypeOf('function');
  });
});
