import {
  applyLookupTableGradeEffectToCanvas,
  defaultCanvasLookupTableGradeEffectRunner,
} from './canvasLookupTableGradeEffect';

describe('applyLookupTableGradeEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyLookupTableGradeEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasLookupTableGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasLookupTableGradeEffectRunner).toBe('function');
  });
});
