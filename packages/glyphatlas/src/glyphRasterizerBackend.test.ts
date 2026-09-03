import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createStubGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('createStubGlyphRasterizerBackend', () => {
  it('returns an Entity with a rasterize method', () => {
    const backend = createStubGlyphRasterizerBackend();
    expect(EntityRuntimeKey in backend).toBe(true);
    expect(typeof backend.rasterize).toBe('function');
  });

  it('produces a non-null glyph for any codepoint and font size', () => {
    const backend = createStubGlyphRasterizerBackend();
    const glyph = backend.rasterize(65, { fontFamily: 'mock', fontSize: 16 });
    expect(glyph).not.toBeNull();
    expect(glyph!.width).toBeGreaterThan(0);
    expect(glyph!.height).toBeGreaterThan(0);
    expect(glyph!.advance).toBeGreaterThan(0);
    expect(glyph!.pixels.length).toBe(glyph!.width * glyph!.height * 4);
  });

  it('returns a new entity on each call', () => {
    const a = createStubGlyphRasterizerBackend();
    const b = createStubGlyphRasterizerBackend();
    expect(a).not.toBe(b);
  });

  it('fills pixels with 255 (opaque white)', () => {
    const backend = createStubGlyphRasterizerBackend();
    const glyph = backend.rasterize(65, { fontFamily: 'mock', fontSize: 16 })!;
    expect(glyph.pixels.every((v) => v === 255)).toBe(true);
  });
});
