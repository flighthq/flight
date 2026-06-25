import { getShadowFilterOffset } from '@flighthq/filters';
import type {
  BevelFilter,
  BitmapFilter,
  BlurFilter,
  ConvolutionFilter,
  DisplacementMapFilter,
  DropShadowFilter,
  GradientBevelFilter,
  GradientGlowFilter,
  MedianFilter,
  OuterGlowFilter,
} from '@flighthq/types';

/**
 * Computes the expanded bounds of a filter relative to its source bounds
 * `(x, y, width, height)`, writing the result into `out`. Returns `out`.
 *
 * For effects that extend outside the source (blur, shadow, glow, bevel, etc.),
 * the output bounds are expanded by the effect's reach. For effects that stay
 * within the source (inner shadow, inner glow, convolution, color matrix,
 * etc.), the output bounds equal the source bounds.
 *
 * Use this to size the destination buffer before calling an `apply*FilterToSurface`
 * function — the returned bounds give the minimum region that contains the full
 * effect output including any spatial offset.
 *
 * `out` fields: `x`, `y` (top-left corner, may be negative relative to source
 * origin), `width`, `height`.
 *
 * Safe to pass the same object as `sourceBounds` and `out` (all inputs are read
 * into locals before `out` is written).
 */
export function getFilterSurfaceBounds(
  filter: Readonly<BitmapFilter>,
  sourceBounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  out: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  // Read all inputs before writing out (alias safety).
  const sx = sourceBounds.x;
  const sy = sourceBounds.y;
  const sw = sourceBounds.width;
  const sh = sourceBounds.height;
  switch (filter.kind) {
    case 'BlurFilter': {
      const f = filter as Readonly<BlurFilter>;
      const padX = Math.ceil(f.blurX ?? 4) * 3;
      const padY = Math.ceil(f.blurY ?? 4) * 3;
      out.x = sx - padX;
      out.y = sy - padY;
      out.width = sw + padX * 2;
      out.height = sh + padY * 2;
      return out;
    }
    case 'DropShadowFilter': {
      const f = filter as Readonly<DropShadowFilter>;
      const blurPadX = Math.ceil(f.blurX ?? 4) * 3;
      const blurPadY = Math.ceil(f.blurY ?? 4) * 3;
      const offsetScratch = { dx: 0, dy: 0 };
      getShadowFilterOffset(f, offsetScratch);
      const dx = offsetScratch.dx;
      const dy = offsetScratch.dy;
      // Expand to include both the source and the shifted shadow.
      const minX = Math.min(sx, sx + dx - blurPadX);
      const minY = Math.min(sy, sy + dy - blurPadY);
      const maxX = Math.max(sx + sw, sx + dx + sw + blurPadX);
      const maxY = Math.max(sy + sh, sy + dy + sh + blurPadY);
      out.x = minX;
      out.y = minY;
      out.width = maxX - minX;
      out.height = maxY - minY;
      return out;
    }
    case 'OuterGlowFilter': {
      const f = filter as Readonly<OuterGlowFilter>;
      const padX = Math.ceil(f.blurX ?? 6) * 3;
      const padY = Math.ceil(f.blurY ?? 6) * 3;
      out.x = sx - padX;
      out.y = sy - padY;
      out.width = sw + padX * 2;
      out.height = sh + padY * 2;
      return out;
    }
    case 'GradientGlowFilter': {
      const f = filter as Readonly<GradientGlowFilter>;
      const padX = Math.ceil(f.blurX ?? 4) * 3;
      const padY = Math.ceil(f.blurY ?? 4) * 3;
      out.x = sx - padX;
      out.y = sy - padY;
      out.width = sw + padX * 2;
      out.height = sh + padY * 2;
      return out;
    }
    case 'BevelFilter': {
      const f = filter as Readonly<BevelFilter>;
      const blurPadX = Math.ceil(f.blurX ?? 4) * 3;
      const blurPadY = Math.ceil(f.blurY ?? 4) * 3;
      out.x = sx - blurPadX;
      out.y = sy - blurPadY;
      out.width = sw + blurPadX * 2;
      out.height = sh + blurPadY * 2;
      return out;
    }
    case 'GradientBevelFilter': {
      const f = filter as Readonly<GradientBevelFilter>;
      const blurPadX = Math.ceil(f.blurX ?? 4) * 3;
      const blurPadY = Math.ceil(f.blurY ?? 4) * 3;
      out.x = sx - blurPadX;
      out.y = sy - blurPadY;
      out.width = sw + blurPadX * 2;
      out.height = sh + blurPadY * 2;
      return out;
    }
    case 'SharpenFilter': {
      // Unsharp mask stays at source size after sharpening.
      void filter;
      out.x = sx;
      out.y = sy;
      out.width = sw;
      out.height = sh;
      return out;
    }
    case 'MedianFilter': {
      const f = filter as Readonly<MedianFilter>;
      const r = f.radius ?? 1;
      out.x = sx - r;
      out.y = sy - r;
      out.width = sw + r * 2;
      out.height = sh + r * 2;
      return out;
    }
    case 'ConvolutionFilter': {
      const f = filter as Readonly<ConvolutionFilter>;
      const kx = Math.floor((f.matrixX ?? 3) / 2);
      const ky = Math.floor((f.matrixY ?? 3) / 2);
      out.x = sx - kx;
      out.y = sy - ky;
      out.width = sw + kx * 2;
      out.height = sh + ky * 2;
      return out;
    }
    case 'DisplacementMapFilter': {
      const f = filter as Readonly<DisplacementMapFilter>;
      // Displacement can shift pixels by up to ±scale/2 in each axis.
      const padX = Math.ceil(Math.abs(f.scaleX ?? 0) / 2);
      const padY = Math.ceil(Math.abs(f.scaleY ?? 0) / 2);
      out.x = sx - padX;
      out.y = sy - padY;
      out.width = sw + padX * 2;
      out.height = sh + padY * 2;
      return out;
    }
    // Inner effects and color-space effects do not expand the bounds.
    case 'InnerGlowFilter':
    case 'InnerShadowFilter':
    case 'ColorMatrixFilter':
    case 'PixelateFilter':
    default:
      out.x = sx;
      out.y = sy;
      out.width = sw;
      out.height = sh;
      return out;
  }
}
