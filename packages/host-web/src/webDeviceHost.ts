import type { HostDeviceCapabilities } from '@flighthq/device/contract';

import { webHostDevice } from './webDevice.ts';

export const webHostDeviceGroup = {
  info: webHostDevice,
} satisfies HostDeviceCapabilities;
