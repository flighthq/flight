import { createHost } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, Host } from '@flighthq/types/contract';

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
} as const satisfies Pick<Omit<Host, typeof EntityRuntimeKey>, 'app'>);
