import { applyBloomEffectToGl, glBloomEffectRunner, registerGlBloomEffect } from './glBloomEffect';

describe('applyBloomEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToGl).toBe('function');
  });
});

describe('glBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glBloomEffectRunner).toBe('function');
  });
});

describe('registerGlBloomEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlBloomEffect).toBeTypeOf('function');
  });
});
