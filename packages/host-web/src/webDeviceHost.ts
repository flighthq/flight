import type { HostDeviceCapabilities } from '@flighthq/types/contract';

import { webHostDevice } from './webDevice';

export const webHostDeviceGroup = {
  info: webHostDevice,
} satisfies HostDeviceCapabilities;
