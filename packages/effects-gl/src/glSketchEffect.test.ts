import { applySketchEffectToGl, defaultGlSketchEffectRunner, registerGlSketchEffect } from './glSketchEffect';

describe('applySketchEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySketchEffectToGl).toBe('function');
  });
});

describe('defaultGlSketchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSketchEffectRunner).toBe('function');
  });
});

describe('registerGlSketchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSketchEffect).toBeTypeOf('function');
  });
});
