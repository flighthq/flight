import {
  applyBrightnessContrastEffectToGl,
  defaultGlBrightnessContrastEffectRunner,
} from './glBrightnessContrastEffect';

describe('applyBrightnessContrastEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyBrightnessContrastEffectToGl).toBe('function');
  });
});

describe('defaultGlBrightnessContrastEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlBrightnessContrastEffectRunner).toBe('function');
  });
});
