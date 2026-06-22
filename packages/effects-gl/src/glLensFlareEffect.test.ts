import { applyLensFlareEffectToGl, defaultGlLensFlareEffectRunner } from './glLensFlareEffect';

describe('applyLensFlareEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToGl).toBe('function');
  });
});

describe('defaultGlLensFlareEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLensFlareEffectRunner).toBe('function');
  });
});
