import { applyGodRaysEffectToGl, defaultGlGodRaysEffectRunner, registerGlGodRaysEffect } from './glGodRaysEffect';

describe('applyGodRaysEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToGl).toBe('function');
  });
});

describe('defaultGlGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGodRaysEffectRunner).toBe('function');
  });
});

describe('registerGlGodRaysEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlGodRaysEffect).toBeTypeOf('function');
  });
});
