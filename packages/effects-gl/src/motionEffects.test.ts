import {
  applyCameraMotionBlurEffectToGl,
  applyDirectionalBlurEffectToGl,
  applyMotionBlurEffectToGl,
  applyRadialBlurEffectToGl,
  defaultGlCameraMotionBlurEffectRunner,
  defaultGlDirectionalBlurEffectRunner,
  defaultGlMotionBlurEffectRunner,
  defaultGlRadialBlurEffectRunner,
} from './motionEffects';

describe('applyCameraMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToGl).toBe('function');
  });
});

describe('applyDirectionalBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToGl).toBe('function');
  });
});

describe('applyMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToGl).toBe('function');
  });
});

describe('applyRadialBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToGl).toBe('function');
  });
});

describe('defaultGlCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultGlDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('defaultGlMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultGlRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlRadialBlurEffectRunner).toBe('function');
  });
});
