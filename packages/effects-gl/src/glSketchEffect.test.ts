import { applySketchEffectToGl, glSketchEffectRunner, registerGlSketchEffect } from './glSketchEffect';

describe('applySketchEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySketchEffectToGl).toBe('function');
  });
});

describe('glSketchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glSketchEffectRunner).toBe('function');
  });
});

describe('registerGlSketchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlSketchEffect).toBeTypeOf('function');
  });
});
