import type { HostDeviceCapabilities } from '@flighthq/types/contract';

import { webHostDevice } from './webDevice.ts';

export const webHostDeviceGroup = {
  info: webHostDevice,
} satisfies HostDeviceCapabilities;
