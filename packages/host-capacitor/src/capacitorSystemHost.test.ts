import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostDeviceGroup, capacitorHostGeolocationGroup } from './capacitorSystemHost';

function fakeCapacitor(): CapacitorApi {
  return {
    device: {
      getId: async () => ({ identifier: 'device-id' }),
      getInfo: async () => ({}),
    },
    geolocation: {},
  } as unknown as CapacitorApi;
}

describe('capacitorHostDeviceGroup', () => {
  it('publishes only the Entity-backed device info slot', () => {
    const device = capacitorHostDeviceGroup(fakeCapacitor());
    expect(Object.keys(device)).toEqual(['info']);
    expect(EntityRuntimeKey in device.info).toBe(true);
  });
});

describe('capacitorHostGeolocationGroup', () => {
  it('publishes only the Entity-backed geolocation position slot', () => {
    const geolocation = capacitorHostGeolocationGroup(fakeCapacitor());
    expect(Object.keys(geolocation)).toEqual(['position']);
    expect(EntityRuntimeKey in geolocation.position).toBe(true);
  });
});
