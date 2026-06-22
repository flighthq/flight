import {
  applyBevelFilterToGl,
  applyBoxBlurFilterToGl,
  applyColorMatrixFilterToGl,
  applyConvolutionFilterToGl,
  applyDisplacementMapFilterToGl,
  applyDropShadowFilterToGl,
  applyGaussianBlurFilterToGl,
  applyGlBlitOffsetPass,
  applyGlBlitPass,
  applyGlInvertTintPass,
  applyGlTintPass,
  applyGradientBevelFilterToGl,
  applyGradientGlowFilterToGl,
  applyInnerGlowFilterToGl,
  applyInnerShadowFilterToGl,
  applyMedianFilterToGl,
  applyOuterGlowFilterToGl,
  applyPixelateFilterToGl,
  applySharpenFilterToGl,
  createGlGradientRampTexture,
} from './index';

describe('index', () => {
  it('exports all filter functions', () => {
    expect(applyBevelFilterToGl).toBeDefined();
    expect(applyBoxBlurFilterToGl).toBeDefined();
    expect(applyColorMatrixFilterToGl).toBeDefined();
    expect(applyConvolutionFilterToGl).toBeDefined();
    expect(applyDisplacementMapFilterToGl).toBeDefined();
    expect(applyDropShadowFilterToGl).toBeDefined();
    expect(applyGaussianBlurFilterToGl).toBeDefined();
    expect(applyGradientBevelFilterToGl).toBeDefined();
    expect(applyGradientGlowFilterToGl).toBeDefined();
    expect(applyInnerGlowFilterToGl).toBeDefined();
    expect(applyInnerShadowFilterToGl).toBeDefined();
    expect(applyMedianFilterToGl).toBeDefined();
    expect(applyOuterGlowFilterToGl).toBeDefined();
    expect(applyPixelateFilterToGl).toBeDefined();
    expect(applySharpenFilterToGl).toBeDefined();
  });

  it('exports infrastructure primitives', () => {
    expect(applyGlBlitOffsetPass).toBeDefined();
    expect(applyGlBlitPass).toBeDefined();
    expect(applyGlInvertTintPass).toBeDefined();
    expect(applyGlTintPass).toBeDefined();
    expect(createGlGradientRampTexture).toBeDefined();
  });
});
