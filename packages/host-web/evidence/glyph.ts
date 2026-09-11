import { webHostGlyphRasterizer } from '@flighthq/host-web';

(globalThis as Record<string, unknown>).__evidence = webHostGlyphRasterizer;
