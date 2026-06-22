import {
  applyBrightnessContrastEffectToCanvas,
  defaultCanvasBrightnessContrastEffectRunner,
} from './canvasBrightnessContrastEffect';

describe('applyBrightnessContrastEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBrightnessContrastEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBrightnessContrastEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBrightnessContrastEffectRunner).toBe('function');
  });
});
