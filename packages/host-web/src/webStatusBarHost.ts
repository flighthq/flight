import type { HostStatusBarCapabilities } from '@flighthq/types/contract';

import { webHostStatusBarColor } from './webStatusbar';

export const webHostStatusBar = {
  color: webHostStatusBarColor,
} satisfies HostStatusBarCapabilities;
