import { applySketchEffectToGl, defaultGlSketchEffectRunner } from './glSketchEffect';

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
