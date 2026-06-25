import {
  computeBlurFilterCss,
  computeDropShadowFilterCss,
  computeOuterGlowFilterCss,
  createSvgFilterDataUri,
  svgFeColorMatrix,
} from '@flighthq/filters-css';
import type { BitmapFilter, BlurFilter, ColorMatrixFilter, DropShadowFilter, OuterGlowFilter } from '@flighthq/types';

/**
 * Applies `filter` to `source` and draws the result onto `dest` at (x, y).
 * Returns true when the filter was handled (including degraded/pass-through
 * cases), or false when the filter kind is unrecognized.
 *
 * Dispatch rules:
 * - BlurFilter (isotropic) and non-knockout DropShadowFilter: CSS fast-path via
 *   save/filter/drawImage/restore.
 * - OuterGlowFilter: CSS drop-shadow approximation via save/filter/drawImage/restore.
 * - ColorMatrixFilter: SVG feColorMatrix encoded as a data URI CSS filter url().
 * - DisplacementMapFilter: no displacement map available in the Canvas 2D context;
 *   draws `source` directly as a degraded pass-through.
 * - BevelFilter, GradientBevelFilter, GradientGlowFilter, InnerGlowFilter,
 *   InnerShadowFilter, MedianFilter, PixelateFilter, SharpenFilter,
 *   ConvolutionFilter: canvas cannot render these natively; draws `source` directly
 *   as a degraded pass-through.
 * - Unknown kind: returns false without drawing.
 */
export function applyCanvasFilter(
  dest: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  filter: BitmapFilter,
): boolean {
  switch (filter.kind) {
    case 'BlurFilter': {
      const css = computeBlurFilterCss(filter as BlurFilter);
      if (css === null) {
        dest.drawImage(source, x, y);
        return true;
      }
      dest.save();
      dest.filter = css;
      dest.drawImage(source, x, y);
      dest.restore();
      return true;
    }

    case 'DropShadowFilter': {
      const css = computeDropShadowFilterCss(filter as DropShadowFilter);
      if (css === null) {
        dest.drawImage(source, x, y);
        return true;
      }
      dest.save();
      dest.filter = css;
      dest.drawImage(source, x, y);
      dest.restore();
      return true;
    }

    case 'OuterGlowFilter': {
      const css = computeOuterGlowFilterCss(filter as OuterGlowFilter);
      if (css === null) {
        dest.drawImage(source, x, y);
        return true;
      }
      dest.save();
      dest.filter = css;
      dest.drawImage(source, x, y);
      dest.restore();
      return true;
    }

    case 'ColorMatrixFilter': {
      const f = filter as ColorMatrixFilter;
      const svgFilter = svgFeColorMatrix(f.matrix as number[]);
      const url = createSvgFilterDataUri(svgFilter);
      dest.save();
      dest.filter = `url(${url})`;
      dest.drawImage(source, x, y);
      dest.restore();
      return true;
    }

    case 'DisplacementMapFilter':
    case 'BevelFilter':
    case 'GradientBevelFilter':
    case 'GradientGlowFilter':
    case 'InnerGlowFilter':
    case 'InnerShadowFilter':
    case 'MedianFilter':
    case 'PixelateFilter':
    case 'SharpenFilter':
    case 'ConvolutionFilter':
      dest.drawImage(source, x, y);
      return true;

    default:
      return false;
  }
}

/**
 * Returns true when a pure CSS filter string is sufficient to render `filter`
 * on a Canvas 2D context — no offscreen compositing required.
 *
 * - BlurFilter: true only when blurX === blurY (isotropic; CSS blur() is isotropic).
 * - DropShadowFilter: true only when knockout is false.
 * - All other kinds: false.
 */
export function canUseCanvasFilterCssFor(filter: BitmapFilter): boolean {
  switch (filter.kind) {
    case 'BlurFilter': {
      const f = filter as BlurFilter;
      const bx = f.blurX ?? 4;
      const by = f.blurY ?? 4;
      return bx === by;
    }
    case 'DropShadowFilter': {
      const f = filter as DropShadowFilter;
      return !f.knockout;
    }
    default:
      return false;
  }
}
