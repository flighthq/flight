import type { HostGraphicsCapabilities } from '@flighthq/types/contract';

import { webHostBitmapEncode } from './webBitmapEncode';
import { webHostBitmapReadback } from './webBitmapReadback';
import { webHostImage } from './webImage';
import { webHostGl, webHostSurface } from './webInputTarget';

export const webHostGraphics = {
  bitmapEncode: webHostBitmapEncode,
  bitmapReadback: webHostBitmapReadback,
  image: webHostImage,
  renderContext: webHostGl,
  renderSurface: webHostSurface,
} satisfies HostGraphicsCapabilities;
