import { installGlyphRasterizerHostBackend } from '@flighthq/glyphatlas/contract';

(globalThis as Record<string, unknown>).__evidence = installGlyphRasterizerHostBackend;
