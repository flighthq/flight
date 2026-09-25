import type { HostAppCapabilities } from '@flighthq/types/contract';

import {
  webHostAppBadge,
  webHostAppFocus,
  webHostAppLocale,
  webHostAppName,
  webHostAppQuit,
  webHostAppReady,
  webHostAppRelaunch,
} from './webApp.ts';
import { webHostAppLoopExit } from './webAppLoopExit.ts';
import { webHostLoop } from './webLoop.ts';

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
