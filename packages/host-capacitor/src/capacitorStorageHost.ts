import type { CapacitorApi, HostFileSystemCapabilities } from '@flighthq/types/contract';

import { capacitorHostFileSystem } from './capacitorFileSystem.ts';

export function capacitorHostFileSystemGroup(
  capacitor: CapacitorApi,
): Required<Pick<HostFileSystemCapabilities, 'access'>> {
  return { access: capacitorHostFileSystem(capacitor) };
}
