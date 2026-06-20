import {
  applyCameraMotionBlurEffectToCanvas,
  applyDirectionalBlurEffectToCanvas,
  applyMotionBlurEffectToCanvas,
  applyRadialBlurEffectToCanvas,
  defaultCanvasCameraMotionBlurEffectRunner,
  defaultCanvasDirectionalBlurEffectRunner,
  defaultCanvasMotionBlurEffectRunner,
  defaultCanvasRadialBlurEffectRunner,
} from './motionEffects';

describe('applyCameraMotionBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToCanvas).toBe('function');
  });
});

describe('applyDirectionalBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToCanvas).toBe('function');
  });
});

describe('applyMotionBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToCanvas).toBe('function');
  });
});

describe('applyRadialBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultCanvasDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('defaultCanvasMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasMotionBlurEffectRunner).toBe('function');
  });
});

describe('defaultCanvasRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasRadialBlurEffectRunner).toBe('function');
  });
});
