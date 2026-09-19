import { describe, expect, it } from 'vitest';

import { allocateStubGlyphRasterizerBackend, initializeStubGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('allocateStubGlyphRasterizerBackend', () => {
  it('returns a backend with a rasterize method', () => {
    const backend = allocateStubGlyphRasterizerBackend();
    expect(typeof backend.rasterize).toBe('function');
  });

  it('produces a non-null glyph for any codepoint and font size', () => {
    const backend = allocateStubGlyphRasterizerBackend();
    const glyph = backend.rasterize(65, { fontFamily: 'mock', fontSize: 16 });
    expect(glyph).not.toBeNull();
    expect(glyph!.width).toBeGreaterThan(0);
    expect(glyph!.height).toBeGreaterThan(0);
    expect(glyph!.advance).toBeGreaterThan(0);
    expect(glyph!.pixels.length).toBe(glyph!.width * glyph!.height * 4);
  });

  it('returns a new entity on each call', () => {
    const a = allocateStubGlyphRasterizerBackend();
    const b = allocateStubGlyphRasterizerBackend();
    expect(a).not.toBe(b);
  });

  it('fills pixels with 255 (opaque white)', () => {
    const backend = allocateStubGlyphRasterizerBackend();
    const glyph = backend.rasterize(65, { fontFamily: 'mock', fontSize: 16 })!;
    expect(glyph.pixels.every((v) => v === 255)).toBe(true);
  });
});
describe('initializeStubGlyphRasterizerBackend', () => {
  it('is the construction initializer of allocateStubGlyphRasterizerBackend', () => {
    expect(typeof initializeStubGlyphRasterizerBackend).toBe('function');
  });
});
