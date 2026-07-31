import {
  applyLensFlareEffectToGl,
  defaultGlLensFlareEffectRunner,
  registerGlLensFlareEffect,
} from './glLensFlareEffect';

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

describe('registerGlLensFlareEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlLensFlareEffect).toBeTypeOf('function');
  });
});
