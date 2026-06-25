import { applyExposureEffectToGl, defaultGlExposureEffectRunner } from './glExposureEffect';

describe('applyExposureEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToGl).toBe('function');
  });
});

describe('defaultGlExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlExposureEffectRunner).toBe('function');
  });
});
