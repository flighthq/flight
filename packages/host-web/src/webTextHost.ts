import type { HostTextCapabilities } from '@flighthq/types/contract';

import { webHostFontLoading } from './webFontLoading';
import { webHostGlyphRasterizer } from './webGlyphRasterizer';

export const webHostText = {
  fontLoading: webHostFontLoading,
  glyphRasterizer: webHostGlyphRasterizer,
} satisfies HostTextCapabilities;
