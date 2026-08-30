import { createWebLifecycleBackend } from '@flighthq/lifecycle/contract';
import type { LifecycleBackend } from '@flighthq/types/contract';

// Published on the Host rather than installed into the lifecycle package: a caller selects this
// provider by passing the host that carries it, so two hosts can hold different providers.
export const webLifecycleBackend: LifecycleBackend = createWebLifecycleBackend();
