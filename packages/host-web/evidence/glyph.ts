import { getGlyphRasterizerBackend } from '@flighthq/glyphatlas';
import { enableHostWebGlyphRasterizer } from '@flighthq/host-web';

enableHostWebGlyphRasterizer();
(globalThis as Record<string, unknown>).__evidence = getGlyphRasterizerBackend();
