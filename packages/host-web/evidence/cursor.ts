import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';
import { createWebCursorBackend } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = { createWebCursorBackend, backend: getGlyphRasterizerBackend() };
