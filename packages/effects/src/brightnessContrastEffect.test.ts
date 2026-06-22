import { createBrightnessContrastEffect } from './brightnessContrastEffect';

describe('createBrightnessContrastEffect', () => {
  it('tags the intent type', () => {
    expect(createBrightnessContrastEffect().kind).toBe('BrightnessContrastEffect');
  });

  it('carries options', () => {
    expect(createBrightnessContrastEffect({ brightness: 0.2, contrast: 1.5 })).toMatchObject({
      brightness: 0.2,
      contrast: 1.5,
    });
  });
});
