import { applyScreenSpaceFogEffectToGl, defaultGlScreenSpaceFogEffectRunner } from './glScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToGl).toBe('function');
  });
});

describe('defaultGlScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlScreenSpaceFogEffectRunner).toBe('function');
  });
});
