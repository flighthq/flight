import {
  createBrightnessContrastEffect,
  createChannelMixerEffect,
  createColorGradeEffect,
  createGrayscaleEffect,
  createHueSaturationEffect,
  createInvertEffect,
  createLiftGammaGainEffect,
  createLookupTableGradeEffect,
  createPosterizeEffect,
  createSepiaEffect,
  createWhiteBalanceEffect,
} from './colorGradeEffects';

describe('createBrightnessContrastEffect', () => {
  it('tags the intent type', () => {
    expect(createBrightnessContrastEffect().type).toBe('brightnessContrast');
  });

  it('carries options', () => {
    expect(createBrightnessContrastEffect({ brightness: 0.2, contrast: 1.5 })).toMatchObject({
      brightness: 0.2,
      contrast: 1.5,
    });
  });
});

describe('createChannelMixerEffect', () => {
  it('tags the intent type', () => {
    expect(createChannelMixerEffect({ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] }).type).toBe('channelMixer');
  });

  it('carries the matrix', () => {
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    expect(createChannelMixerEffect({ matrix }).matrix).toBe(matrix);
  });
});

describe('createColorGradeEffect', () => {
  it('tags the intent type', () => {
    expect(createColorGradeEffect().type).toBe('colorGrade');
  });

  it('carries options', () => {
    expect(createColorGradeEffect({ exposure: 1, saturation: 1.2 })).toMatchObject({ exposure: 1, saturation: 1.2 });
  });
});

describe('createGrayscaleEffect', () => {
  it('tags the intent type', () => {
    expect(createGrayscaleEffect().type).toBe('grayscale');
  });

  it('carries options', () => {
    expect(createGrayscaleEffect({ intensity: 0.5 })).toMatchObject({ intensity: 0.5 });
  });
});

describe('createHueSaturationEffect', () => {
  it('tags the intent type', () => {
    expect(createHueSaturationEffect().type).toBe('hueSaturation');
  });

  it('carries options', () => {
    expect(createHueSaturationEffect({ hue: 90, saturation: 1.4, lightness: 0.1 })).toMatchObject({
      hue: 90,
      saturation: 1.4,
      lightness: 0.1,
    });
  });
});

describe('createInvertEffect', () => {
  it('tags the intent type', () => {
    expect(createInvertEffect().type).toBe('invert');
  });

  it('carries options', () => {
    expect(createInvertEffect({ intensity: 0.75 })).toMatchObject({ intensity: 0.75 });
  });
});

describe('createLiftGammaGainEffect', () => {
  it('tags the intent type', () => {
    expect(createLiftGammaGainEffect().type).toBe('liftGammaGain');
  });

  it('carries options', () => {
    expect(createLiftGammaGainEffect({ lift: 0x808080ff, gamma: 0x808080ff, gain: 0x808080ff })).toMatchObject({
      lift: 0x808080ff,
      gamma: 0x808080ff,
      gain: 0x808080ff,
    });
  });
});

describe('createLookupTableGradeEffect', () => {
  it('tags the intent type', () => {
    expect(createLookupTableGradeEffect().type).toBe('lutGrade');
  });

  it('carries options', () => {
    expect(createLookupTableGradeEffect({ size: 32, strength: 0.8 })).toMatchObject({ size: 32, strength: 0.8 });
  });
});

describe('createPosterizeEffect', () => {
  it('tags the intent type', () => {
    expect(createPosterizeEffect().type).toBe('posterize');
  });

  it('carries options', () => {
    expect(createPosterizeEffect({ levels: 4 })).toMatchObject({ levels: 4 });
  });
});

describe('createSepiaEffect', () => {
  it('tags the intent type', () => {
    expect(createSepiaEffect().type).toBe('sepia');
  });

  it('carries options', () => {
    expect(createSepiaEffect({ intensity: 0.6 })).toMatchObject({ intensity: 0.6 });
  });
});

describe('createWhiteBalanceEffect', () => {
  it('tags the intent type', () => {
    expect(createWhiteBalanceEffect().type).toBe('whiteBalance');
  });

  it('carries options', () => {
    expect(createWhiteBalanceEffect({ temperature: 0.3, tint: -0.2 })).toMatchObject({ temperature: 0.3, tint: -0.2 });
  });
});
