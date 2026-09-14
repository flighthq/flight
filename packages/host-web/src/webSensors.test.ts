import { createWebSensorsBackend, webHostSensors } from './webSensors';

describe('createWebSensorsBackend', () => {
  it('subscribes to all streams without throwing', () => {
    const backend = createWebSensorsBackend();
    const unsubs = [
      backend.subscribeMotion(() => {}),
      backend.subscribeLinearAcceleration(() => {}),
      backend.subscribeGravity(() => {}),
      backend.subscribeOrientation(() => {}),
      backend.subscribeAbsoluteOrientation(() => {}),
      backend.subscribeMagnetometer(() => {}),
      backend.subscribeAmbientLight(() => {}),
      backend.subscribeBarometer(() => {}),
      backend.subscribeProximity(() => {}),
      backend.subscribeQuaternion(() => {}),
    ];
    expect(() => unsubs.forEach((u) => u())).not.toThrow();
  });

  it('resolves a permission request without throwing', async () => {
    expect(typeof (await createWebSensorsBackend().requestPermission())).toBe('boolean');
  });

  it('resolves permission state without throwing', async () => {
    const state = await createWebSensorsBackend().getPermissionState();
    expect(['granted', 'denied', 'prompt', 'unsupported']).toContain(state);
  });
});

describe('webHostSensors', () => {
  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webSensors')).webHostSensors;
    expect(again).toBe(webHostSensors);
  });

  it('answers every support query without throwing', () => {
    for (const query of [
      webHostSensors.isMotionSupported,
      webHostSensors.isOrientationSupported,
      webHostSensors.isBarometerSupported,
      webHostSensors.isProximitySupported,
    ]) {
      expect(typeof query.call(webHostSensors)).toBe('boolean');
    }
  });
});
