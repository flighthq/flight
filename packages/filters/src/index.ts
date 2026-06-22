import type {
  BevelFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DisplacementMapFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  InnerGlowFilter,
  InnerShadowFilter,
  MedianFilter,
  OuterGlowFilter,
  PixelateFilter,
  SharpenFilter,
} from '@flighthq/types';

export {
  computeBlurFilterCss,
  computeDropShadowFilterCss,
  computeOuterGlowFilterCss,
  getShadowFilterOffset,
} from './css';
export { computeBoxBlurPassRadius, computeBoxBlurRadius } from './math';
export {
  applyBevelFilterToSurface,
  applyBlurFilterToSurface,
  applyColorMatrixFilterToSurface,
  applyConvolutionFilterToSurface,
  applyDisplacementMapFilterToSurface,
  applyDropShadowFilterToSurface,
  applyGradientBevelFilterToSurface,
  applyGradientGlowFilterToSurface,
  applyInnerGlowFilterToSurface,
  applyInnerShadowFilterToSurface,
  applyMedianFilterToSurface,
  applyOuterGlowFilterToSurface,
  applyPixelateFilterToSurface,
  applySharpenFilterToSurface,
} from './surface';
export type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DisplacementMapFilter,
  DisplacementMapMode,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  InnerGlowFilter,
  InnerShadowFilter,
  MedianFilter,
  OuterGlowFilter,
  PixelateFilter,
  SharpenFilter,
} from '@flighthq/types';

export function createBevelFilter(options?: Omit<BevelFilter, 'type'>): BevelFilter {
  return { type: 'bevel', ...options };
}

export function createBlurFilter(options?: Omit<BlurFilter, 'type'>): BlurFilter {
  return { type: 'blur', ...options };
}

export function createColorMatrixFilter(matrix: ReadonlyArray<number>): ColorMatrixFilter {
  return { type: 'colorMatrix', matrix };
}

export function createConvolutionFilter(options: Omit<ConvolutionFilter, 'type'>): ConvolutionFilter {
  return { type: 'convolution', ...options };
}

export function createDisplacementMapFilter(options?: Omit<DisplacementMapFilter, 'type'>): DisplacementMapFilter {
  return { type: 'displacementMap', ...options };
}

export function createDropShadowFilter(options?: Omit<DropShadowFilter, 'type'>): DropShadowFilter {
  return { type: 'dropShadow', ...options };
}

export function createGradientBevelFilter(options: Omit<GradientBevelFilter, 'type'>): GradientBevelFilter {
  return { type: 'gradientBevel', ...options };
}

export function createGradientGlowFilter(options: Omit<GradientGlowFilter, 'type'>): GradientGlowFilter {
  return { type: 'gradientGlow', ...options };
}

export function createInnerGlowFilter(options?: Omit<InnerGlowFilter, 'type'>): InnerGlowFilter {
  return { type: 'innerGlow', ...options };
}

export function createInnerShadowFilter(options?: Omit<InnerShadowFilter, 'type'>): InnerShadowFilter {
  return { type: 'innerShadow', ...options };
}

export function createMedianFilter(options?: Omit<MedianFilter, 'type'>): MedianFilter {
  return { type: 'median', ...options };
}

export function createOuterGlowFilter(options?: Omit<OuterGlowFilter, 'type'>): OuterGlowFilter {
  return { type: 'outerGlow', ...options };
}

export function createPixelateFilter(options?: Omit<PixelateFilter, 'type'>): PixelateFilter {
  return { type: 'pixelate', ...options };
}

export function createSharpenFilter(options?: Omit<SharpenFilter, 'type'>): SharpenFilter {
  return { type: 'sharpen', ...options };
}
