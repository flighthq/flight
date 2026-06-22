import {
  applyLensDistortionEffectToCanvas,
  defaultCanvasLensDistortionEffectRunner,
} from './canvasLensDistortionEffect';

describe('applyLensDistortionEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyLensDistortionEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasLensDistortionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasLensDistortionEffectRunner).toBe('function');
  });
});
