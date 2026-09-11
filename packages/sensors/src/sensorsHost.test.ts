import type { HostSensorsProvider } from '@flighthq/types/contract';

import { getSensorsPermissionState, hasAccelerometer, hasBarometer, isSensorsSupported } from './sensors';

function hostWith(backend: Partial<HostSensorsProvider>): {
  readonly system: { readonly sensors: HostSensorsProvider };
} {
  return { system: { sensors: backend as HostSensorsProvider } } as {
    readonly system: { readonly sensors: HostSensorsProvider };
  };
}

describe('getSensorsPermissionState', () => {
  it('reads the permission state from the host it is given', async () => {
    const host = hostWith({ getPermissionState: () => Promise.resolve('granted') });
    expect(await getSensorsPermissionState(host.system.sensors, 'motion')).toBe('granted');
  });

  // Two hosts, two answers. Before the migration both calls resolved one process-wide backend, so the
  // second host was unreachable no matter what it carried.
  it('keeps two hosts independent', async () => {
    const granted = hostWith({ getPermissionState: () => Promise.resolve('granted') });
    const denied = hostWith({ getPermissionState: () => Promise.resolve('denied') });
    expect(await getSensorsPermissionState(granted.system.sensors, 'motion')).toBe('granted');
    expect(await getSensorsPermissionState(denied.system.sensors, 'motion')).toBe('denied');
  });
});

describe('hasAccelerometer', () => {
  it('reports motion support from the host provider', () => {
    expect(hasAccelerometer(hostWith({ isMotionSupported: () => true }).system.sensors)).toBe(true);
    expect(hasAccelerometer(hostWith({ isMotionSupported: () => false }).system.sensors)).toBe(false);
  });
});

describe('hasBarometer', () => {
  it('reports barometer support from the host provider', () => {
    expect(hasBarometer(hostWith({ isBarometerSupported: () => true }).system.sensors)).toBe(true);
    expect(hasBarometer(hostWith({ isBarometerSupported: () => false }).system.sensors)).toBe(false);
  });
});

describe('isSensorsSupported', () => {
  it('reports support from the host provider', () => {
    expect(isSensorsSupported(hostWith({ isMotionSupported: () => true }).system.sensors)).toBe(true);
    expect(isSensorsSupported(hostWith({ isMotionSupported: () => false }).system.sensors)).toBe(false);
  });
});
