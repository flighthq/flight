import { applyLensDirtEffectToGl, defaultGlLensDirtEffectRunner } from './glLensDirtEffect';

describe('applyLensDirtEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToGl).toBe('function');
  });
});

describe('defaultGlLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensDirtEffectRunner).toBe('function');
  });
});
