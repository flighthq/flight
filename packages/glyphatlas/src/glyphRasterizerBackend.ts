import type { GlyphRasterizedBitmap, HostGlyphRasterizerCapability } from '@flighthq/types/contract';

export function allocateStubGlyphRasterizerBackend(): HostGlyphRasterizerCapability {
  const out = {} as HostGlyphRasterizerCapability;
  initializeStubGlyphRasterizerBackend(out);
  return out;
}

export function initializeStubGlyphRasterizerBackend(out: HostGlyphRasterizerCapability): void {
  out.rasterize = (_codepoint, options): GlyphRasterizedBitmap | null => {
    const size = Math.max(1, Math.round(options.fontSize));
    const width = Math.max(1, Math.round(size * 0.6));
    const height = Math.max(1, Math.round(size * 0.7));
    const pixels = new Uint8ClampedArray(width * height * 4);
    pixels.fill(255);
    return {
      advance: width + Math.max(1, Math.round(size * 0.1)),
      bearingX: 0,
      bearingY: height,
      height,
      pixels,
      width,
    };
  };
}
