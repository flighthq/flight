import { createHost } from '@flighthq/entity/contract';
import type { HostGraphicsCapabilities } from '@flighthq/types/contract';

import { webHostBitmapEncode } from './webBitmapEncode';
import { webHostBitmapReadback } from './webBitmapReadback';
import { webHostImage } from './webImage';
import { webHostRenderContext, webHostRenderSurface } from './webInputTarget';

export const webHostGraphics = {
  bitmapEncode: webHostBitmapEncode,
  bitmapReadback: webHostBitmapReadback,
  image: webHostImage,
  renderContext: webHostRenderContext,
  renderSurface: webHostRenderSurface,
} satisfies HostGraphicsCapabilities;

export const webGraphicsHost = /* @__PURE__ */ createHost({ graphics: webHostGraphics });
