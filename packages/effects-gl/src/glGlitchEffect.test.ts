import { applyGlitchEffectToGl, defaultGlGlitchEffectRunner } from './glGlitchEffect';

describe('applyGlitchEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGlitchEffectToGl).toBe('function');
  });
});

describe('defaultGlGlitchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGlitchEffectRunner).toBe('function');
  });
});
