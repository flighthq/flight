import { createGlyphAtlas, createStubGlyphRasterizerBackend } from '@flighthq/glyphatlas';

(globalThis as Record<string, unknown>).__evidence = createGlyphAtlas({
  fontFamily: 'test',
  fontSize: 16,
  height: 64,
  rasterizerBackend: createStubGlyphRasterizerBackend(),
  width: 64,
});
