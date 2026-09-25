import type { HostGeolocationCapabilities } from '@flighthq/types/contract';

import { webHostGeolocation } from './webGeolocation.ts';

export const webHostGeolocationGroup = {
  position: webHostGeolocation,
} satisfies HostGeolocationCapabilities;
