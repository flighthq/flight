import {
  applyBevelFilterToWebGL,
  applyBlitOffsetPassWebGL,
  applyBlitPassWebGL,
  applyBoxBlurFilterToWebGL,
  applyColorMatrixFilterToWebGL,
  applyConvolutionFilterToWebGL,
  applyDisplacementMapFilterToWebGL,
  applyDropShadowFilterToWebGL,
  applyGaussianBlurFilterToWebGL,
  applyGradientBevelFilterToWebGL,
  applyGradientGlowFilterToWebGL,
  applyInnerGlowFilterToWebGL,
  applyInnerShadowFilterToWebGL,
  applyInvertTintPassWebGL,
  applyMedianFilterToWebGL,
  applyOuterGlowFilterToWebGL,
  applyPixelateFilterToWebGL,
  applySharpenFilterToWebGL,
  applyTintPassWebGL,
  clearWebGLFilterTarget,
  compileWebGLFilterProgram,
  createWebGLGradientRampTexture,
  drawWebGLDualSourcePass,
  drawWebGLFilterPass,
} from './index';

describe('index', () => {
  it('exports all filter functions', () => {
    expect(applyBevelFilterToWebGL).toBeDefined();
    expect(applyBoxBlurFilterToWebGL).toBeDefined();
    expect(applyColorMatrixFilterToWebGL).toBeDefined();
    expect(applyConvolutionFilterToWebGL).toBeDefined();
    expect(applyDisplacementMapFilterToWebGL).toBeDefined();
    expect(applyDropShadowFilterToWebGL).toBeDefined();
    expect(applyGaussianBlurFilterToWebGL).toBeDefined();
    expect(applyGradientBevelFilterToWebGL).toBeDefined();
    expect(applyGradientGlowFilterToWebGL).toBeDefined();
    expect(applyInnerGlowFilterToWebGL).toBeDefined();
    expect(applyInnerShadowFilterToWebGL).toBeDefined();
    expect(applyMedianFilterToWebGL).toBeDefined();
    expect(applyOuterGlowFilterToWebGL).toBeDefined();
    expect(applyPixelateFilterToWebGL).toBeDefined();
    expect(applySharpenFilterToWebGL).toBeDefined();
  });

  it('exports infrastructure primitives', () => {
    expect(clearWebGLFilterTarget).toBeDefined();
    expect(compileWebGLFilterProgram).toBeDefined();
    expect(drawWebGLDualSourcePass).toBeDefined();
    expect(drawWebGLFilterPass).toBeDefined();
    expect(applyBlitOffsetPassWebGL).toBeDefined();
    expect(applyBlitPassWebGL).toBeDefined();
    expect(applyInvertTintPassWebGL).toBeDefined();
    expect(applyTintPassWebGL).toBeDefined();
    expect(createWebGLGradientRampTexture).toBeDefined();
  });
});
