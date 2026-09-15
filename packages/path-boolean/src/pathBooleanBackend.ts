import type { HostPathBooleanProvider } from '@flighthq/types/contract';

import { createMartinezPathBooleanBackend } from './martinezKernel';

export function createDefaultPathBooleanBackend(): HostPathBooleanProvider {
  return createMartinezPathBooleanBackend();
}
