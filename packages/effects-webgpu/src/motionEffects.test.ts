import {
  applyCameraMotionBlurEffectToWebGPU,
  applyDirectionalBlurEffectToWebGPU,
  applyMotionBlurEffectToWebGPU,
  applyRadialBlurEffectToWebGPU,
  defaultWebGPUCameraMotionBlurEffectRunner,
  defaultWebGPUDirectionalBlurEffectRunner,
  defaultWebGPUMotionBlurEffectRunner,
  defaultWebGPURadialBlurEffectRunner,
} from './motionEffects';

describe('applyCameraMotionBlurEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToWebGPU).toBe('function');
  });
});

describe('applyDirectionalBlurEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWebGPU).toBe('function');
  });
});

describe('applyMotionBlurEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToWebGPU).toBe('function');
  });
});

describe('applyRadialBlurEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToWebGPU).toBe('function');
  });
});

describe('defaultWebGPUCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWebGPURadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPURadialBlurEffectRunner).toBe('function');
  });
});
