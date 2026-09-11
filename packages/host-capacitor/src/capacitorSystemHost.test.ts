import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { capacitorHostSystem } from './capacitorSystemHost';

function fakeCapacitor(): CapacitorApi {
  return {
    device: {
      getId: async () => ({ identifier: 'device-id' }),
      getInfo: async () => ({}),
    },
    geolocation: {},
  } as unknown as CapacitorApi;
}

describe('capacitorHostSystem', () => {
  it('publishes only the Entity-backed device and geolocation slots', () => {
    const system = capacitorHostSystem(fakeCapacitor());
    expect(Object.keys(system).sort()).toEqual(['device', 'geolocation']);
    expect(EntityRuntimeKey in system.device).toBe(true);
    expect(EntityRuntimeKey in system.geolocation).toBe(true);
  });
});
