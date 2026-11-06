import type { HostDeviceCapabilities } from '@flighthq/device/contract';
import type { HostGeolocationCapabilities } from '@flighthq/host/contract';

import { capacitorHostDevice } from './capacitorDevice.ts';
import { capacitorHostGeolocation } from './capacitorGeolocation.ts';
import type { CapacitorApi } from './types/index.ts';

export function capacitorHostDeviceGroup(capacitor: CapacitorApi): Required<Pick<HostDeviceCapabilities, 'info'>> {
  return { info: capacitorHostDevice(capacitor) };
}

export function capacitorHostGeolocationGroup(
  capacitor: CapacitorApi,
): Required<Pick<HostGeolocationCapabilities, 'position'>> {
  return { position: capacitorHostGeolocation(capacitor) };
}
