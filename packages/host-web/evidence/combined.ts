import { startApplicationLoop } from '@flighthq/application';
import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';
import { createWebCursorBackend, enableHostWebGlyphRasterizer, enableHostWebLoop } from '@flighthq/host-web';

enableHostWebGlyphRasterizer();
enableHostWebLoop();
(globalThis as Record<string, unknown>).__evidence = {
  createWebCursorBackend,
  glyphBackend: getGlyphRasterizerBackend(),
  loop: startApplicationLoop,
};
