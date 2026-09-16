import type { HostGeolocationCapabilities } from '@flighthq/types/contract';

import { webHostGeolocation } from './webGeolocation';

export const webHostGeolocationGroup = {
  position: webHostGeolocation,
} satisfies HostGeolocationCapabilities;
