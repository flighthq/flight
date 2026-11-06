import type { HostFileSystemCapabilities } from '@flighthq/host/contract';

import { capacitorHostFileSystem } from './capacitorFileSystem.ts';
import type { CapacitorApi } from './types/index.ts';

export function capacitorHostFileSystemGroup(
  capacitor: CapacitorApi,
): Required<Pick<HostFileSystemCapabilities, 'access'>> {
  return { access: capacitorHostFileSystem(capacitor) };
}
