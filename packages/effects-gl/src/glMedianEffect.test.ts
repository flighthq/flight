import { applyMedianEffectToGl, defaultGlMedianEffectRunner } from './glMedianEffect';

describe('applyMedianEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToGl).toBe('function');
  });
});

describe('defaultGlMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMedianEffectRunner).toBe('function');
  });
});
