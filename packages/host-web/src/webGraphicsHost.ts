import { createHost } from '@flighthq/entity/contract';
import type {
  HasGraphicsBitmapEncode,
  HasGraphicsBitmapReadback,
  HasGraphicsImage,
  HasGraphicsRenderContextSubscription,
  HasGraphicsRenderSurface,
  Host,
} from '@flighthq/types/contract';

import { webBitmapEncodeBackend } from './webBitmapEncode';
import { webBitmapReadbackBackend } from './webBitmapReadback';
import { webImageBackend } from './webImage';
import { webRenderContextBackend, webRenderSurfaceBackend } from './webInputTarget';

export const webGraphicsHost: Host &
  HasGraphicsBitmapEncode &
  HasGraphicsBitmapReadback &
  HasGraphicsImage &
  HasGraphicsRenderContextSubscription &
  HasGraphicsRenderSurface = createHost({
  graphics: {
    bitmapEncode: webBitmapEncodeBackend,
    bitmapReadback: webBitmapReadbackBackend,
    image: webImageBackend,
    renderContext: webRenderContextBackend,
    renderSurface: webRenderSurfaceBackend,
  },
});
