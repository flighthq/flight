import type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DropShadowFilter,
  GlowFilter,
} from '@flighthq/types';

export type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ColorMatrixFilter,
  ConvolutionFilter,
  DropShadowFilter,
  GlowFilter,
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

export function createDropShadowFilter(options?: Omit<DropShadowFilter, 'type'>): DropShadowFilter {
  return { type: 'dropShadow', ...options };
}

export function createGlowFilter(options?: Omit<GlowFilter, 'type'>): GlowFilter {
  return { type: 'glow', ...options };
}

/**
 * Returns a CSS filter string for the given bitmap filter, or null if the filter
 * has no CSS equivalent (e.g. inner shadows, knockout, convolution, bevel, or
 * anisotropic blur). Use this for fast hardware-accelerated rendering in canvas
 * and DOM contexts; for pixel-perfect output use the surface or WebGL paths.
 */
export function filterToCSS(filter: BitmapFilter): string | null {
  switch (filter.type) {
    case 'blur': {
      const bx = filter.blurX ?? 4;
      const by = filter.blurY ?? 4;
      if (bx !== by) return null;
      if (bx <= 0) return null;
      return `blur(${bx}px)`;
    }
    case 'dropShadow': {
      if (filter.inner || filter.knockout) return null;
      const angle = ((filter.angle ?? 45) * Math.PI) / 180;
      const distance = filter.distance ?? 4;
      const dx = Math.round(Math.cos(angle) * distance);
      const dy = Math.round(Math.sin(angle) * distance);
      const blurX = filter.blurX ?? 4;
      const blurY = filter.blurY ?? 4;
      if (blurX !== blurY) return null;
      const blur = blurX;
      const color = filter.color ?? 0;
      const alpha = filter.alpha ?? 1;
      return `drop-shadow(${dx}px ${dy}px ${blur}px ${rgbaFromInt(color, alpha)})`;
    }
    case 'glow': {
      if (filter.inner || filter.knockout) return null;
      const blurX = filter.blurX ?? 6;
      const blurY = filter.blurY ?? 6;
      if (blurX !== blurY) return null;
      const blur = blurX;
      const color = filter.color ?? 0xff0000;
      const alpha = filter.alpha ?? 1;
      return `drop-shadow(0px 0px ${blur}px ${rgbaFromInt(color, alpha)})`;
    }
    case 'colorMatrix':
    case 'convolution':
    case 'bevel':
      return null;
  }
}

function rgbaFromInt(color: number, alpha: number): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
