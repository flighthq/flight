import type { HostSensorsCapabilities } from '@flighthq/types/contract';

import { webHostSensors } from './webSensors.ts';

export const webHostSensorsGroup = {
  query: webHostSensors,
} satisfies HostSensorsCapabilities;
