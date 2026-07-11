import { applyBevelEffectToGl, defaultGlBevelEffectRunner } from './glBevelEffect';

describe('applyBevelEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBevelEffectToGl).toBe('function');
  });
});

describe('defaultGlBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBevelEffectRunner).toBe('function');
  });
});
