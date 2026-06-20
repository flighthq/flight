import {
  applyCameraMotionBlurEffectToWebGL,
  applyDirectionalBlurEffectToWebGL,
  applyMotionBlurEffectToWebGL,
  applyRadialBlurEffectToWebGL,
  defaultWebGLCameraMotionBlurEffectRunner,
  defaultWebGLDirectionalBlurEffectRunner,
  defaultWebGLMotionBlurEffectRunner,
  defaultWebGLRadialBlurEffectRunner,
} from './motionEffects';

describe('applyCameraMotionBlurEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToWebGL).toBe('function');
  });
});

describe('applyDirectionalBlurEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWebGL).toBe('function');
  });
});

describe('applyMotionBlurEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToWebGL).toBe('function');
  });
});

describe('applyRadialBlurEffectToWebGL', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToWebGL).toBe('function');
  });
});

describe('defaultWebGLCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGLDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGLMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGLRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGLRadialBlurEffectRunner).toBe('function');
  });
});
