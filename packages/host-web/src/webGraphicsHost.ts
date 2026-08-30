import { createHost } from '@flighthq/entity/contract';
import type { HasGraphicsRenderContextSubscription, HasGraphicsRenderSurface, Host } from '@flighthq/types/contract';

import { webRenderContextBackend, webRenderSurfaceBackend } from './webInputTarget';

export const webGraphicsHost: Host & HasGraphicsRenderContextSubscription & HasGraphicsRenderSurface = createHost({
  graphics: {
    renderContext: webRenderContextBackend,
    renderSurface: webRenderSurfaceBackend,
  },
});
