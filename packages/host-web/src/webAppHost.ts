import { createHost } from '@flighthq/entity/contract';

import { createWebAppCapabilities } from './webApp';
import { webApplicationExitBackend } from './webApplicationExit';
import { webApplicationVisibilityBackend, webLoopBackend } from './webLoop';

const webAppCapabilities = createWebAppCapabilities();

export const webAppHost = createHost({
  app: {
    ...webAppCapabilities,
    exit: webApplicationExitBackend,
    loop: webLoopBackend,
    visibility: webApplicationVisibilityBackend,
  },
});
