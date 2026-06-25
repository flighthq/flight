import { createBevelFilter } from './bevelFilter';
import { getBitmapFilterMargin } from './bitmapFilterMargin';
import { createBlurFilter } from './blurFilter';
import { createColorMatrixFilter } from './colorMatrixFilter';
import { createIdentityColorMatrix } from './colorMatrixMath';
import { createConvolutionFilter } from './convolutionFilter';
import { createDisplacementMapFilter } from './displacementMapFilter';
import { createDropShadowFilter } from './dropShadowFilter';
import { createGradientBevelFilter } from './gradientBevelFilter';
import { createGradientGlowFilter } from './gradientGlowFilter';
import { createInnerGlowFilter } from './innerGlowFilter';
import { createInnerShadowFilter } from './innerShadowFilter';
import { createMedianFilter } from './medianFilter';
import { createOuterGlowFilter } from './outerGlowFilter';
import { createPixelateFilter } from './pixelateFilter';
import { createSharpenFilter } from './sharpenFilter';

describe('getBitmapFilterMargin', () => {
  it('blur filter returns symmetric non-zero margins', () => {
    const margin = getBitmapFilterMargin(createBlurFilter({ blurX: 8, blurY: 4 }));
    expect(margin.left).toBeGreaterThan(0);
    expect(margin.right).toBe(margin.left);
    expect(margin.top).toBeGreaterThan(0);
    expect(margin.bottom).toBe(margin.top);
    // blurX > blurY so horizontal > vertical
    expect(margin.left).toBeGreaterThan(margin.top);
  });

  it('blur filter with equal blurX/blurY returns symmetric margins on all sides', () => {
    const margin = getBitmapFilterMargin(createBlurFilter({ blurX: 4, blurY: 4 }));
    expect(margin.top).toBe(margin.right);
    expect(margin.right).toBe(margin.bottom);
    expect(margin.bottom).toBe(margin.left);
  });

  it('color matrix filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(createColorMatrixFilter(createIdentityColorMatrix()));
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('convolution filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(
      createConvolutionFilter({ matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0], matrixX: 3, matrixY: 3 }),
    );
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('displacement map filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(createDisplacementMapFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('drop shadow filter returns non-zero margin (blur + distance)', () => {
    const margin = getBitmapFilterMargin(createDropShadowFilter({ blurX: 4, blurY: 4, angle: 0, distance: 8 }));
    // angle=0 means shadow is purely horizontal: right/left expand, top/bottom are just blur
    expect(margin.right).toBeGreaterThan(margin.top);
    expect(margin.left).toBeGreaterThan(0);
    // All sides still have at least the blur radius
    expect(margin.top).toBeGreaterThan(0);
  });

  it('gradient bevel filter returns non-zero margin', () => {
    const margin = getBitmapFilterMargin(
      createGradientBevelFilter({ alphas: [1, 0], colors: [0xffffff, 0x000000], ratios: [0, 255] }),
    );
    expect(margin.top).toBeGreaterThan(0);
    expect(margin.right).toBeGreaterThan(0);
    expect(margin.bottom).toBeGreaterThan(0);
    expect(margin.left).toBeGreaterThan(0);
  });

  it('gradient glow filter returns non-zero margin', () => {
    const margin = getBitmapFilterMargin(
      createGradientGlowFilter({ alphas: [0, 1], colors: [0x000000, 0xffffff], ratios: [0, 255] }),
    );
    expect(margin.top).toBeGreaterThan(0);
  });

  it('bevel filter returns non-zero margin', () => {
    const margin = getBitmapFilterMargin(createBevelFilter({ blurX: 4, blurY: 4 }));
    expect(margin.top).toBeGreaterThan(0);
    expect(margin.right).toBe(margin.top);
  });

  it('inner glow filter returns zero margin (inner effect)', () => {
    const margin = getBitmapFilterMargin(createInnerGlowFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('inner shadow filter returns zero margin (inner effect)', () => {
    const margin = getBitmapFilterMargin(createInnerShadowFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('median filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(createMedianFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('outer glow filter returns non-zero margin', () => {
    const margin = getBitmapFilterMargin(createOuterGlowFilter({ blurX: 8, blurY: 8 }));
    expect(margin.top).toBeGreaterThan(0);
    expect(margin.right).toBe(margin.top);
    expect(margin.bottom).toBe(margin.top);
    expect(margin.left).toBe(margin.top);
  });

  it('pixelate filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(createPixelateFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('sharpen filter returns zero margin', () => {
    const margin = getBitmapFilterMargin(createSharpenFilter());
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });

  it('writes into the provided out parameter', () => {
    const out = { top: 99, right: 99, bottom: 99, left: 99 };
    const returned = getBitmapFilterMargin(createBlurFilter({ blurX: 4, blurY: 4 }), out);
    expect(returned).toBe(out);
    expect(out.top).not.toBe(99);
  });

  it('zero blur values produce zero margin', () => {
    const margin = getBitmapFilterMargin(createBlurFilter({ blurX: 0, blurY: 0 }));
    expect(margin.top).toBe(0);
    expect(margin.right).toBe(0);
    expect(margin.bottom).toBe(0);
    expect(margin.left).toBe(0);
  });
});
