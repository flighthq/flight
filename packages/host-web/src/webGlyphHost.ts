import type { HostGlyphCapabilities } from '@flighthq/types/contract';

import { webHostGlyphRasterizer } from './webGlyphRasterizer';

export const webHostGlyph = {
  rasterizer: webHostGlyphRasterizer,
} satisfies HostGlyphCapabilities;
