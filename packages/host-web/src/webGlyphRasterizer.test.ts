import { describe, expect, it } from 'vitest';

import { webHostGlyphRasterizer } from './webGlyphRasterizer';

describe('webHostGlyphRasterizer', () => {
  it('constructs a backend with rasterize and measureMetrics', () => {
    const backend = webHostGlyphRasterizer;
    expect(backend.rasterize).toBeTypeOf('function');
    expect(backend.measureMetrics).toBeTypeOf('function');
  });

  it('rasterize returns null when no canvas context is available', () => {
    const backend = webHostGlyphRasterizer;
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      expect(backend.rasterize(65, { fontFamily: 'x', fontSize: 16 })).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });

  it('measureMetrics returns null when no canvas context is available', () => {
    const backend = webHostGlyphRasterizer;
    const saved = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    try {
      expect(backend.measureMetrics!({ fontFamily: 'x', fontSize: 16 })).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = saved;
    }
  });
});
