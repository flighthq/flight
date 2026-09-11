import { createWebSensorsBackend } from '@flighthq/sensors/contract';
import type { HostSensorsProvider } from '@flighthq/types/contract';

// Published on the Host rather than installed into the sensors package, so a caller selects this
// provider by passing the host that carries it.
export const webHostSensors: HostSensorsProvider = createWebSensorsBackend();
