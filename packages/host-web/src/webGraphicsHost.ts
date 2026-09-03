import { createHost } from '@flighthq/entity/contract';
import type {
  HasGraphicsBitmapReadback,
  HasGraphicsRenderContextSubscription,
  HasGraphicsRenderSurface,
  Host,
} from '@flighthq/types/contract';

import { webBitmapReadbackBackend } from './webBitmapReadback';
import { webRenderContextBackend, webRenderSurfaceBackend } from './webInputTarget';

export const webGraphicsHost: Host &
  HasGraphicsBitmapReadback &
  HasGraphicsRenderContextSubscription &
  HasGraphicsRenderSurface = createHost({
  graphics: {
    bitmapReadback: webBitmapReadbackBackend,
    renderContext: webRenderContextBackend,
    renderSurface: webRenderSurfaceBackend,
  },
});
