import { applyColorGradeEffectToGl, defaultGlColorGradeEffectRunner } from './glColorGradeEffect';

describe('applyColorGradeEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyColorGradeEffectToGl).toBe('function');
  });
});

describe('defaultGlColorGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlColorGradeEffectRunner).toBe('function');
  });
});
