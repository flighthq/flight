import { applyLookupTableGradeEffectToGl, defaultGlLookupTableGradeEffectRunner } from './glLookupTableGradeEffect';

describe('applyLookupTableGradeEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLookupTableGradeEffectToGl).toBe('function');
  });
});

describe('defaultGlLookupTableGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLookupTableGradeEffectRunner).toBe('function');
  });
});
