import type { HostFontCapabilities } from '@flighthq/types/contract';

import { webHostFontLoading } from './webFontLoading';

export const webHostFont = {
  loader: webHostFontLoading,
} satisfies HostFontCapabilities;
