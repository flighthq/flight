import { createHost } from '@flighthq/entity/contract';
import type {
  HasGraphicsBitmapEncode,
  HasGraphicsBitmapReadback,
  HasGraphicsRenderContextSubscription,
  HasGraphicsRenderSurface,
  Host,
} from '@flighthq/types/contract';

import { webBitmapEncodeBackend } from './webBitmapEncode';
import { webBitmapReadbackBackend } from './webBitmapReadback';
import { webRenderContextBackend, webRenderSurfaceBackend } from './webInputTarget';

export const webGraphicsHost: Host &
  HasGraphicsBitmapEncode &
  HasGraphicsBitmapReadback &
  HasGraphicsRenderContextSubscription &
  HasGraphicsRenderSurface = createHost({
  graphics: {
    bitmapEncode: webBitmapEncodeBackend,
    bitmapReadback: webBitmapReadbackBackend,
    renderContext: webRenderContextBackend,
    renderSurface: webRenderSurfaceBackend,
  },
});
