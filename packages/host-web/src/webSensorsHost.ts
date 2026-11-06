import type { HostSensorsCapabilities } from '@flighthq/sensors/contract';

import { webHostSensors } from './webSensors.ts';

export const webHostSensorsGroup = {
  query: webHostSensors,
} satisfies HostSensorsCapabilities;
