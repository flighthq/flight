import type { HostImageCapabilities } from '@flighthq/host/contract';

import { webHostImage } from './webImage.ts';

export const webHostImageGroup = {
  loader: webHostImage,
} satisfies HostImageCapabilities;
