import { startAppLoop } from '@flighthq/app';
import { allocateWebCursorBackend, webHostGlyphRasterizer, webHostLoop } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = {
  allocateWebCursorBackend,
  startAppLoop,
  webHostGlyphRasterizer,
  webHostLoop,
};
