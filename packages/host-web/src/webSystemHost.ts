import { createHost } from '@flighthq/entity/contract';
import type { HostSystemCapabilities } from '@flighthq/types/contract';

import { webHostDevice } from './webDevice';
import { webHostGeolocation } from './webGeolocation';
import { webHostLifecycle } from './webLifecycle';
import { webHostPlatform } from './webPlatform';
import { webHostSensors } from './webSensors';

export const webHostSystem = {
  device: webHostDevice,
  geolocation: webHostGeolocation,
  lifecycle: webHostLifecycle,
  platform: webHostPlatform,
  sensors: webHostSensors,
} satisfies HostSystemCapabilities;

export const webSystemHost = /* @__PURE__ */ createHost({ system: webHostSystem });
