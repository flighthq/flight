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
import { webHostAppLoopExit } from './webAppLoopExit';
import { webHostLoop } from './webLoop';

export const webHostApp = {
  badge: webHostAppBadge,
  exit: webHostAppLoopExit,
  focus: webHostAppFocus,
  locale: webHostAppLocale,
  loop: webHostLoop,
  name: webHostAppName,
  quit: webHostAppQuit,
  ready: webHostAppReady,
  relaunch: webHostAppRelaunch,
} satisfies HostAppCapabilities;
