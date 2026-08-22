import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';

(globalThis as Record<string, unknown>).__evidence = getGlyphRasterizerBackend();
