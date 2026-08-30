import { createHost } from '@flighthq/entity/contract';

import { webDeviceBackend } from './webDevice';
import { webLifecycleBackend } from './webLifecycle';
import { webPlatformBackend } from './webPlatform';
import { webSensorsBackend } from './webSensors';

export const webSystemHost = createHost({
  system: {
    device: webDeviceBackend,
    lifecycle: webLifecycleBackend,
    platform: webPlatformBackend,
    sensors: webSensorsBackend,
  },
});
