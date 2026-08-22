import { installGlyphRasterizerHostBackend, observeGlyphRasterizerHostResult } from '@flighthq/glyphatlas/contract';
import type {
  GlyphMetrics,
  GlyphRasterizedBitmap,
  GlyphRasterizeOptions,
  GlyphRasterizerBackend,
} from '@flighthq/types/contract';

export function createWebGlyphRasterizerBackend(): GlyphRasterizerBackend {
  return {
    measureMetrics(options): GlyphMetrics | null {
      const context = _acquireGlyphRasterContext();
      if (context === null) {
        observeGlyphRasterizerHostResult('measureMetrics', false);
        return null;
      }
      _applyGlyphRasterFont(context, options);
      const metrics = context.measureText('Hg');
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      if (!(ascent > 0) || !(descent >= 0)) {
        observeGlyphRasterizerHostResult('measureMetrics', false);
        return null;
      }
      observeGlyphRasterizerHostResult('measureMetrics', true);
      return { ascent, descent, lineGap: 0 };
    },
    rasterize(codepoint, options): GlyphRasterizedBitmap | null {
      const context = _acquireGlyphRasterContext();
      if (context === null) {
        observeGlyphRasterizerHostResult('rasterize', false);
        return null;
      }
      // Observe on context acquisition, not on result: null is valid for zero-ink glyphs (space).
      observeGlyphRasterizerHostResult('rasterize', true);
      return _rasterizeGlyphOnContext(context, codepoint, options);
    },
  };
}

export function enableHostWebGlyphRasterizer(): void {
  if (_enabled) return;
  _enabled = true;
  installGlyphRasterizerHostBackend(createWebGlyphRasterizerBackend());
}

function _acquireGlyphRasterContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const context = new OffscreenCanvas(1, 1).getContext('2d');
      if (context !== null) return context;
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const context = document.createElement('canvas').getContext('2d');
      if (context !== null) return context;
    }
  } catch {
    return null;
  }
  return null;
}

function _applyGlyphRasterFont(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  options: Readonly<GlyphRasterizeOptions>,
): void {
  const fontStyle = options.fontStyle ?? 'normal';
  const fontWeight = options.fontWeight ?? 'normal';
  context.font = `${fontStyle} ${fontWeight} ${options.fontSize}px ${options.fontFamily}`;
}

function _rasterizeGlyphOnContext(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  codepoint: number,
  options: Readonly<GlyphRasterizeOptions>,
): GlyphRasterizedBitmap | null {
  const text = String.fromCodePoint(codepoint);
  _applyGlyphRasterFont(context, options);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';

  const metrics = context.measureText(text);
  const advance = metrics.width;
  const left = metrics.actualBoundingBoxLeft ?? 0;
  const right = metrics.actualBoundingBoxRight ?? advance;
  const ascent = metrics.actualBoundingBoxAscent ?? options.fontSize;
  const descent = metrics.actualBoundingBoxDescent ?? 0;

  const guard = 1;
  const width = Math.max(0, Math.ceil(left + right)) + guard * 2;
  const height = Math.max(0, Math.ceil(ascent + descent)) + guard * 2;
  if (width <= guard * 2 || height <= guard * 2) return null;

  const canvas = context.canvas;
  canvas.width = width;
  canvas.height = height;
  _applyGlyphRasterFont(context, options);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillText(text, guard + left, guard + ascent);

  const image = context.getImageData(0, 0, width, height);
  return {
    advance,
    bearingX: -left,
    bearingY: ascent,
    height,
    pixels: new Uint8ClampedArray(image.data),
    width,
  };
}

export function resetHostWebGlyphRasterizerForTest(): void {
  _enabled = false;
}

let _enabled = false;
