import { applyHueSaturationEffectToGl, defaultGlHueSaturationEffectRunner } from './glHueSaturationEffect';

describe('applyHueSaturationEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyHueSaturationEffectToGl).toBe('function');
  });
});

describe('defaultGlHueSaturationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlHueSaturationEffectRunner).toBe('function');
  });
});
