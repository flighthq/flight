import { createHost } from '@flighthq/entity/contract';
import type { HostAppCapabilities } from '@flighthq/types/contract';

import {
  webHostAppBadge,
  webHostAppFocus,
  webHostAppLocale,
  webHostAppName,
  webHostAppQuit,
  webHostAppReady,
  webHostAppRelaunch,
} from './webApp';
import { webHostApplicationExit } from './webApplicationExit';
import { webHostApplicationVisibility, webHostLoop } from './webLoop';

export const webHostApp = {
  badge: webHostAppBadge,
  exit: webHostApplicationExit,
  focus: webHostAppFocus,
  locale: webHostAppLocale,
  loop: webHostLoop,
  name: webHostAppName,
  quit: webHostAppQuit,
  ready: webHostAppReady,
  relaunch: webHostAppRelaunch,
  visibility: webHostApplicationVisibility,
} satisfies HostAppCapabilities;

export const webAppHost = /* @__PURE__ */ createHost({ app: webHostApp });
