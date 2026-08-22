import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';
import { createWebCursorBackend, enableHostWebGlyphRasterizer } from '@flighthq/host-web';

enableHostWebGlyphRasterizer();
(globalThis as Record<string, unknown>).__evidence = { createWebCursorBackend, backend: getGlyphRasterizerBackend() };
