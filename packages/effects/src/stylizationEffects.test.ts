import {
  createCRTEffect,
  createDitherEffect,
  createFilmGrainEffect,
  createGlitchEffect,
  createHalftoneEffect,
  createKuwaharaEffect,
  createOutlineEffect,
  createPixelateEffect,
  createScanlinesEffect,
  createSharpenEffect,
  createSketchEffect,
} from './stylizationEffects';

describe('createCRTEffect', () => {
  it('tags the intent type', () => {
    expect(createCRTEffect().type).toBe('crt');
  });

  it('carries options', () => {
    expect(createCRTEffect({ curvature: 0.2, scanlineIntensity: 0.5, vignette: 0.3, aberration: 0.01 })).toMatchObject({
      curvature: 0.2,
      scanlineIntensity: 0.5,
      vignette: 0.3,
      aberration: 0.01,
    });
  });
});

describe('createDitherEffect', () => {
  it('tags the intent type', () => {
    expect(createDitherEffect().type).toBe('dither');
  });

  it('carries options', () => {
    expect(createDitherEffect({ levels: 4 })).toMatchObject({ levels: 4 });
  });
});

describe('createFilmGrainEffect', () => {
  it('tags the intent type', () => {
    expect(createFilmGrainEffect().type).toBe('filmGrain');
  });

  it('carries options', () => {
    expect(createFilmGrainEffect({ intensity: 0.3, size: 2, seed: 7 })).toMatchObject({
      intensity: 0.3,
      size: 2,
      seed: 7,
    });
  });
});

describe('createGlitchEffect', () => {
  it('tags the intent type', () => {
    expect(createGlitchEffect().type).toBe('glitch');
  });

  it('carries options', () => {
    expect(createGlitchEffect({ intensity: 0.7, blockSize: 22, colorShift: 12, seed: 3 })).toMatchObject({
      intensity: 0.7,
      blockSize: 22,
      colorShift: 12,
      seed: 3,
    });
  });
});

describe('createHalftoneEffect', () => {
  it('tags the intent type', () => {
    expect(createHalftoneEffect().type).toBe('halftone');
  });

  it('carries options', () => {
    expect(createHalftoneEffect({ scale: 6, angle: 0.5 })).toMatchObject({ scale: 6, angle: 0.5 });
  });
});

describe('createKuwaharaEffect', () => {
  it('tags the intent type', () => {
    expect(createKuwaharaEffect().type).toBe('kuwahara');
  });

  it('carries options', () => {
    expect(createKuwaharaEffect({ radius: 3 })).toMatchObject({ radius: 3 });
  });
});

describe('createOutlineEffect', () => {
  it('tags the intent type', () => {
    expect(createOutlineEffect().type).toBe('outline');
  });

  it('carries options', () => {
    expect(createOutlineEffect({ threshold: 0.2, thickness: 1.5, color: 0x000000ff })).toMatchObject({
      threshold: 0.2,
      thickness: 1.5,
      color: 0x000000ff,
    });
  });
});

describe('createPixelateEffect', () => {
  it('tags the intent type', () => {
    expect(createPixelateEffect().type).toBe('pixelate');
  });

  it('carries options', () => {
    expect(createPixelateEffect({ size: 8 })).toMatchObject({ size: 8 });
  });
});

describe('createScanlinesEffect', () => {
  it('tags the intent type', () => {
    expect(createScanlinesEffect().type).toBe('scanlines');
  });

  it('carries options', () => {
    expect(createScanlinesEffect({ count: 240, intensity: 0.4 })).toMatchObject({ count: 240, intensity: 0.4 });
  });
});

describe('createSharpenEffect', () => {
  it('tags the intent type', () => {
    expect(createSharpenEffect().type).toBe('sharpen');
  });

  it('carries options', () => {
    expect(createSharpenEffect({ amount: 0.6 })).toMatchObject({ amount: 0.6 });
  });
});

describe('createSketchEffect', () => {
  it('tags the intent type', () => {
    expect(createSketchEffect().type).toBe('sketch');
  });

  it('carries options', () => {
    expect(createSketchEffect({ strength: 0.8 })).toMatchObject({ strength: 0.8 });
  });
});
