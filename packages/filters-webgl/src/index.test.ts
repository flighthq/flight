import {
  applyBevelFilterToWebGL,
  applyBlitOffsetPass,
  applyBlitPass,
  applyBlurFilterToWebGL,
  applyColorMatrixFilterToWebGL,
  applyConvolutionFilterToWebGL,
  applyDisplacementMapFilterToWebGL,
  applyDropShadowFilterToWebGL,
  applyGradientBevelFilterToWebGL,
  applyGradientGlowFilterToWebGL,
  applyInnerGlowFilterToWebGL,
  applyInnerShadowFilterToWebGL,
  applyInvertTintPass,
  applyMedianFilterToWebGL,
  applyOuterGlowFilterToWebGL,
  applyPixelateFilterToWebGL,
  applySharpenFilterToWebGL,
  applyTintPass,
  boxRadiusForSigmaWebGL,
  clearWebGLFilterTarget,
  compileWebGLFilterProgram,
  createWebGLGradientRampTexture,
  drawWebGLDualSourcePass,
  drawWebGLFilterPass,
} from './index';

describe('index', () => {
  it('exports all filter functions', () => {
    expect(applyBevelFilterToWebGL).toBeDefined();
    expect(applyBlurFilterToWebGL).toBeDefined();
    expect(applyColorMatrixFilterToWebGL).toBeDefined();
    expect(applyConvolutionFilterToWebGL).toBeDefined();
    expect(applyDisplacementMapFilterToWebGL).toBeDefined();
    expect(applyDropShadowFilterToWebGL).toBeDefined();
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
    expect(applyBlitOffsetPass).toBeDefined();
    expect(applyBlitPass).toBeDefined();
    expect(applyInvertTintPass).toBeDefined();
    expect(applyTintPass).toBeDefined();
    expect(boxRadiusForSigmaWebGL).toBeDefined();
    expect(createWebGLGradientRampTexture).toBeDefined();
  });
});
