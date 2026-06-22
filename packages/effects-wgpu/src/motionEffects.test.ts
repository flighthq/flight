import {
  applyCameraMotionBlurEffectToWgpu,
  applyDirectionalBlurEffectToWgpu,
  applyMotionBlurEffectToWgpu,
  applyRadialBlurEffectToWgpu,
  defaultWgpuCameraMotionBlurEffectRunner,
  defaultWgpuDirectionalBlurEffectRunner,
  defaultWgpuMotionBlurEffectRunner,
  defaultWgpuRadialBlurEffectRunner,
} from './motionEffects';

describe('applyCameraMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('applyDirectionalBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWgpu).toBe('function');
  });
});

describe('applyMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('applyRadialBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWgpuDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('defaultWgpuMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultWgpuRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuRadialBlurEffectRunner).toBe('function');
  });
});
