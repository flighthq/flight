import { describe, expect, it } from 'vitest';

import * as filtersWgpu from './index';

describe('index', () => {
  it('exports all filter functions', () => {
    expect(filtersWgpu.applyBevelFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyBoxBlurFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyColorMatrixFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyConvolutionFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyDisplacementMapFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyDropShadowFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyGaussianBlurFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyGradientBevelFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyGradientGlowFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyInnerGlowFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyInnerShadowFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyMedianFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyOuterGlowFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applyPixelateFilterToWgpu).toBeTypeOf('function');
    expect(filtersWgpu.applySharpenFilterToWgpu).toBeTypeOf('function');
  });

  it('exports filter pass infrastructure', () => {
    expect(filtersWgpu.clearWgpuFilterTarget).toBeTypeOf('function');
    expect(filtersWgpu.createWgpuFilterPipeline).toBeTypeOf('function');
    expect(filtersWgpu.createWgpuDualSourcePipeline).toBeTypeOf('function');
    expect(filtersWgpu.createWgpuTripleSourcePipeline).toBeTypeOf('function');
    expect(filtersWgpu.drawWgpuFilterPass).toBeTypeOf('function');
    expect(filtersWgpu.drawWgpuDualSourcePass).toBeTypeOf('function');
    expect(filtersWgpu.drawWgpuTripleSourcePass).toBeTypeOf('function');
  });

  it('exports tint shader primitives', () => {
    expect(filtersWgpu.applyWgpuTintPass).toBeTypeOf('function');
    expect(filtersWgpu.applyWgpuInvertTintPass).toBeTypeOf('function');
    expect(filtersWgpu.applyWgpuBlitPass).toBeTypeOf('function');
    expect(filtersWgpu.applyWgpuBlitOffsetPass).toBeTypeOf('function');
    expect(filtersWgpu.applyWgpuInnerClipPass).toBeTypeOf('function');
    expect(filtersWgpu.getWgpuTintShader).toBeTypeOf('function');
    expect(filtersWgpu.getWgpuInvertTintShader).toBeTypeOf('function');
    expect(filtersWgpu.getWgpuBlitShader).toBeTypeOf('function');
    expect(filtersWgpu.getWgpuBlitOffsetShader).toBeTypeOf('function');
    expect(filtersWgpu.getWgpuInnerClipShader).toBeTypeOf('function');
  });

  it('exports gradient ramp utility', () => {
    expect(filtersWgpu.createWgpuGradientRampTexture).toBeTypeOf('function');
  });
});
