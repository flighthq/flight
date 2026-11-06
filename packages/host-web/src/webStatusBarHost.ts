import type { HostStatusBarCapabilities } from '@flighthq/statusbar/contract';

import { webHostStatusBarColor } from './webStatusbar.ts';

export const webHostStatusBar = {
  color: webHostStatusBarColor,
} satisfies HostStatusBarCapabilities;
