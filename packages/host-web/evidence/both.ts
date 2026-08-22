import { createWebCursorBackend, enableHostWebGlyphRasterizer } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = { createWebCursorBackend, enableHostWebGlyphRasterizer };
