import type { GlyphRasterizedBitmap, GlyphRasterizeOptions, GlyphRasterizerBackend } from '@flighthq/types';

// Builds the default web backend, which rasterizes a glyph on an offscreen canvas: it sets the font,
// measures the glyph box + advance with `measureText`, fills the glyph with `fillText`, and reads the
// pixels back with `getImageData`. Nothing touches the DOM at construction time — the canvas is
// acquired lazily on the first `rasterize` — so importing the package has no side effect. When no
// canvas is available (a headless/native host, or jsdom without a 2D context) `rasterize` returns
// null rather than throwing; a native host installs its own backend via `setGlyphRasterizerBackend`.
export function createWebGlyphRasterizerBackend(): GlyphRasterizerBackend {
  return {
    rasterize(codepoint, options): GlyphRasterizedBitmap | null {
      const context = _acquireGlyphRasterContext();
      if (context === null) return null;
      return _rasterizeGlyphOnContext(context, codepoint, options);
    },
  };
}

// The active rasterizer backend, lazily defaulting to the web canvas backend. There is always a
// backend; `getGlyphAtlasEntry` asks this one to render a missing glyph.
export function getGlyphRasterizerBackend(): GlyphRasterizerBackend {
  if (_backend === null) _backend = createWebGlyphRasterizerBackend();
  return _backend;
}

// Installs a native host rasterizer backend; pass null to fall back to the lazy web default.
export function setGlyphRasterizerBackend(backend: GlyphRasterizerBackend | null): void {
  _backend = backend;
}

let _backend: GlyphRasterizerBackend | null = null;

// Acquires a 2D drawing context from whichever canvas the host offers — an `OffscreenCanvas` first,
// then a DOM `<canvas>` — or null when neither exists (or has no 2D context). The whole acquisition
// is guarded so a host that throws on `getContext` degrades to the null sentinel instead of failing.
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

// Renders one glyph onto `context` and reads it back as a straight-alpha RGBA bitmap. The context's
// canvas is resized to the measured ink box (plus a 1px guard on each side so anti-aliased edges are
// not clipped); the glyph is filled in opaque white at the baseline so a text renderer can tint it.
// Returns null for a zero-area glyph (whitespace with no ink) so the caller records only real glyphs.
function _rasterizeGlyphOnContext(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  codepoint: number,
  options: Readonly<GlyphRasterizeOptions>,
): GlyphRasterizedBitmap | null {
  const text = String.fromCodePoint(codepoint);
  const fontStyle = options.fontStyle ?? 'normal';
  const fontWeight = options.fontWeight ?? 'normal';
  context.font = `${fontStyle} ${fontWeight} ${options.fontSize}px ${options.fontFamily}`;
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
  // font resets when the canvas is resized, so restore it before drawing.
  context.font = `${fontStyle} ${fontWeight} ${options.fontSize}px ${options.fontFamily}`;
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
