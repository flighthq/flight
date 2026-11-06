import type { HostGlyphCapabilities } from '@flighthq/host/contract';

import { webHostGlyphRasterizer } from './webGlyphRasterizer.ts';

export const webHostGlyph = {
  rasterizer: webHostGlyphRasterizer,
} satisfies HostGlyphCapabilities;
