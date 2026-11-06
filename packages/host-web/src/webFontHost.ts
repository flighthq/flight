import type { HostFontCapabilities } from '@flighthq/host/contract';

import { webHostFontLoading } from './webFontLoading.ts';

export const webHostFont = {
  loader: webHostFontLoading,
} satisfies HostFontCapabilities;
