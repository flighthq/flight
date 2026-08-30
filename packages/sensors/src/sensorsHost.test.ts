import type { HasSystemSensors, SensorsBackend } from '@flighthq/types/contract';

import { getSensorsPermissionState, hasAccelerometer, hasBarometer, isSensorsSupported } from './sensors';

function hostWith(backend: Partial<SensorsBackend>): HasSystemSensors {
  return { system: { sensors: backend as SensorsBackend } } as HasSystemSensors;
}

describe('getSensorsPermissionState', () => {
  it('reads the permission state from the host it is given', async () => {
    const host = hostWith({ getPermissionState: () => Promise.resolve('granted') });
    expect(await getSensorsPermissionState(host, 'motion')).toBe('granted');
  });

  // Two hosts, two answers. Before the migration both calls resolved one process-wide backend, so the
  // second host was unreachable no matter what it carried.
  it('keeps two hosts independent', async () => {
    const granted = hostWith({ getPermissionState: () => Promise.resolve('granted') });
    const denied = hostWith({ getPermissionState: () => Promise.resolve('denied') });
    expect(await getSensorsPermissionState(granted, 'motion')).toBe('granted');
    expect(await getSensorsPermissionState(denied, 'motion')).toBe('denied');
  });
});

describe('hasAccelerometer', () => {
  it('reports motion support from the host provider', () => {
    expect(hasAccelerometer(hostWith({ isMotionSupported: () => true }))).toBe(true);
    expect(hasAccelerometer(hostWith({ isMotionSupported: () => false }))).toBe(false);
  });
});

describe('hasBarometer', () => {
  it('reports barometer support from the host provider', () => {
    expect(hasBarometer(hostWith({ isBarometerSupported: () => true }))).toBe(true);
    expect(hasBarometer(hostWith({ isBarometerSupported: () => false }))).toBe(false);
  });
});

describe('isSensorsSupported', () => {
  it('reports support from the host provider', () => {
    expect(isSensorsSupported(hostWith({ isMotionSupported: () => true }))).toBe(true);
    expect(isSensorsSupported(hostWith({ isMotionSupported: () => false }))).toBe(false);
  });
});
