import { startApplicationLoop } from '@flighthq/application';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';
import { createWebCursorBackend, enableHostWebGlyphRasterizer, webLoopBackend } from '@flighthq/host-web';

enableHostWebGlyphRasterizer();
(globalThis as Record<string, unknown>).__evidence = {
  createWebCursorBackend,
  glyphBackend: getGlyphRasterizerBackend(),
  startApplicationLoop,
  webLoopBackend,
};
