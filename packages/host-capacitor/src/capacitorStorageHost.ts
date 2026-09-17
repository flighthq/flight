import type { CapacitorApi, HostFileSystemCapabilities } from '@flighthq/types/contract';

import { capacitorHostFileSystem } from './capacitorFileSystem';

export function capacitorHostFileSystemGroup(
  capacitor: CapacitorApi,
): Required<Pick<HostFileSystemCapabilities, 'access'>> {
  return { access: capacitorHostFileSystem(capacitor) };
}
