import type { HostImageCapabilities } from '@flighthq/types/contract';

import { webHostImage } from './webImage';

export const webHostImageGroup = {
  loader: webHostImage,
} satisfies HostImageCapabilities;
