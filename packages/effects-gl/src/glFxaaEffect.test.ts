import { applyFxaaEffectToGl, defaultGlFxaaEffectRunner } from './glFxaaEffect';

describe('applyFxaaEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToGl).toBe('function');
  });
});

describe('defaultGlFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlFxaaEffectRunner).toBe('function');
  });
});
