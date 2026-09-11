import type { CapacitorApi, HostSystemCapabilities } from '@flighthq/types/contract';

import { capacitorHostDevice } from './capacitorDevice';
import { capacitorHostGeolocation } from './capacitorGeolocation';

export function capacitorHostSystem(
  capacitor: CapacitorApi,
): HostSystemCapabilities & Required<Pick<HostSystemCapabilities, 'device' | 'geolocation'>> {
  return {
    device: capacitorHostDevice(capacitor),
    geolocation: capacitorHostGeolocation(capacitor),
  };
}
