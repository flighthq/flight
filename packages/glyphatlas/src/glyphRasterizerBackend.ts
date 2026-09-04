import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  GlyphRasterizedBitmap,
  GlyphRasterizerBackend,
} from '@flighthq/types/contract';

export function createStubGlyphRasterizerBackend(): GlyphRasterizerBackend & Entity {
  const out = allocateEntity<GlyphRasterizerBackend & Entity>();
  initializeStubGlyphRasterizerBackend(out);
  return finishEntity(out);
}

export function initializeStubGlyphRasterizerBackend(out: EntityConstruction<GlyphRasterizerBackend & Entity>): void {
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
