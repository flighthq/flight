import { createWebSensorsBackend } from '@flighthq/sensors/contract';
import type { SensorsBackend } from '@flighthq/types/contract';

// Published on the Host rather than installed into the sensors package, so a caller selects this
// provider by passing the host that carries it.
export const webSensorsBackend: SensorsBackend = createWebSensorsBackend();
