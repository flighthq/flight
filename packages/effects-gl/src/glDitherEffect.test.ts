import { applyDitherEffectToGl, defaultGlDitherEffectRunner } from './glDitherEffect';

describe('applyDitherEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToGl).toBe('function');
  });
});

describe('defaultGlDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDitherEffectRunner).toBe('function');
  });
});
