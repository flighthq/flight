import type { HostSensorsCapabilities } from '@flighthq/types/contract';

import { webHostSensors } from './webSensors';

export const webHostSensorsGroup = {
  query: webHostSensors,
} satisfies HostSensorsCapabilities;
