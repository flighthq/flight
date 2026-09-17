import type { CapacitorApi, HostDeviceCapabilities, HostGeolocationCapabilities } from '@flighthq/types/contract';

import { capacitorHostDevice } from './capacitorDevice';
import { capacitorHostGeolocation } from './capacitorGeolocation';

export function capacitorHostDeviceGroup(capacitor: CapacitorApi): Required<Pick<HostDeviceCapabilities, 'info'>> {
  return { info: capacitorHostDevice(capacitor) };
}

export function capacitorHostGeolocationGroup(
  capacitor: CapacitorApi,
): Required<Pick<HostGeolocationCapabilities, 'position'>> {
  return { position: capacitorHostGeolocation(capacitor) };
}
