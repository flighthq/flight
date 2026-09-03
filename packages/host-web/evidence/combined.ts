import { startApplicationLoop } from '@flighthq/application';
import { createWebCursorBackend, webGlyphRasterizerBackend, webLoopBackend } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = {
  createWebCursorBackend,
  glyphBackend: webGlyphRasterizerBackend,
  startApplicationLoop,
  webLoopBackend,
};
