import { webGlyphRasterizerBackend } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = webGlyphRasterizerBackend;
