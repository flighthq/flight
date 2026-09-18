import { startAppLoop } from '@flighthq/app';
import { createWebCursorBackend, webHostGlyphRasterizer, webHostLoop } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = {
  createWebCursorBackend,
  startAppLoop,
  webHostGlyphRasterizer,
  webHostLoop,
};
