import { startApplicationLoop } from '@flighthq/application';
import { createWebCursorBackend, webHostGlyphRasterizer, webHostLoop } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = {
  createWebCursorBackend,
  startApplicationLoop,
  webHostGlyphRasterizer,
  webHostLoop,
};
