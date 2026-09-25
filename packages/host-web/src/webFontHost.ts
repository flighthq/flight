import type { HostFontCapabilities } from '@flighthq/types/contract';

import { webHostFontLoading } from './webFontLoading.ts';

export const webHostFont = {
  loader: webHostFontLoading,
} satisfies HostFontCapabilities;
