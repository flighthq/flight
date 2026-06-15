import { describe, expect, it } from 'vitest';

import * as filtersWebGPU from './index';

describe('index', () => {
  it('exports all filter functions', () => {
    expect(filtersWebGPU.applyBevelFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyBoxBlurFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyColorMatrixFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyConvolutionFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyDisplacementMapFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyDropShadowFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyGaussianBlurFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyGradientBevelFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyGradientGlowFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyInnerGlowFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyInnerShadowFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyMedianFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyOuterGlowFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applyPixelateFilterToWebGPU).toBeTypeOf('function');
    expect(filtersWebGPU.applySharpenFilterToWebGPU).toBeTypeOf('function');
  });

  it('exports filter pass infrastructure', () => {
    expect(filtersWebGPU.clearWebGPUFilterTarget).toBeTypeOf('function');
    expect(filtersWebGPU.createWebGPUFilterPipeline).toBeTypeOf('function');
    expect(filtersWebGPU.createWebGPUDualSourcePipeline).toBeTypeOf('function');
    expect(filtersWebGPU.createWebGPUTripleSourcePipeline).toBeTypeOf('function');
    expect(filtersWebGPU.drawWebGPUFilterPass).toBeTypeOf('function');
    expect(filtersWebGPU.drawWebGPUDualSourcePass).toBeTypeOf('function');
    expect(filtersWebGPU.drawWebGPUTripleSourcePass).toBeTypeOf('function');
  });

  it('exports tint shader primitives', () => {
    expect(filtersWebGPU.applyTintPass).toBeTypeOf('function');
    expect(filtersWebGPU.applyInvertTintPass).toBeTypeOf('function');
    expect(filtersWebGPU.applyBlitPass).toBeTypeOf('function');
    expect(filtersWebGPU.applyBlitOffsetPass).toBeTypeOf('function');
    expect(filtersWebGPU.applyInnerClipPass).toBeTypeOf('function');
    expect(filtersWebGPU.getTintShader).toBeTypeOf('function');
    expect(filtersWebGPU.getInvertTintShader).toBeTypeOf('function');
    expect(filtersWebGPU.getBlitShader).toBeTypeOf('function');
    expect(filtersWebGPU.getBlitOffsetShader).toBeTypeOf('function');
    expect(filtersWebGPU.getInnerClipShader).toBeTypeOf('function');
  });

  it('exports gradient ramp utility', () => {
    expect(filtersWebGPU.createWebGPUGradientRampTexture).toBeTypeOf('function');
  });
});
