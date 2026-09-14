import type { HostSystemCapabilities } from '@flighthq/types/contract';

import { webHostDevice } from './webDevice';
import { webHostGeolocation } from './webGeolocation';
import { webHostLifecycle } from './webLifecycle';
import { webHostPermissions } from './webPermissions';
import { webHostPlatform } from './webPlatform';
import { webHostSensors } from './webSensors';

export const webHostSystem = {
  device: webHostDevice,
  geolocation: webHostGeolocation,
  lifecycle: webHostLifecycle,
  permissions: webHostPermissions,
  platform: webHostPlatform,
  sensors: webHostSensors,
} satisfies HostSystemCapabilities;
