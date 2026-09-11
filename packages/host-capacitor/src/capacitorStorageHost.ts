import type { CapacitorApi, HostStorageCapabilities } from '@flighthq/types/contract';

import { capacitorHostFileSystem } from './capacitorFileSystem';

export function capacitorHostStorage(
  capacitor: CapacitorApi,
): HostStorageCapabilities & Required<Pick<HostStorageCapabilities, 'fileSystem'>> {
  return { fileSystem: capacitorHostFileSystem(capacitor) };
}
