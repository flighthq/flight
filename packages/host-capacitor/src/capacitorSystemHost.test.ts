import type { CapacitorApi } from '@flighthq/types/contract';

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
  it('publishes only the device info slot', () => {
    const device = capacitorHostDeviceGroup(fakeCapacitor());
    expect(Object.keys(device)).toEqual(['info']);
    expect(device.info.getId).toBeTypeOf('function');
  });
});

describe('capacitorHostGeolocationGroup', () => {
  it('publishes only the geolocation position slot', () => {
    const geolocation = capacitorHostGeolocationGroup(fakeCapacitor());
    expect(Object.keys(geolocation)).toEqual(['position']);
    expect(geolocation.position.getCurrentPosition).toBeTypeOf('function');
  });
});
