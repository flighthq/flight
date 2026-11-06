import type { HostGeolocationCapabilities } from '@flighthq/host/contract';

import { webHostGeolocation } from './webGeolocation.ts';

export const webHostGeolocationGroup = {
  position: webHostGeolocation,
} satisfies HostGeolocationCapabilities;
