import { webHostSensors } from './webSensors.ts';

describe('webHostSensors', () => {
  it('subscribes to all streams without throwing', () => {
    const unsubs = [
      webHostSensors.subscribeMotion(() => {}),
      webHostSensors.subscribeLinearAcceleration(() => {}),
      webHostSensors.subscribeGravity(() => {}),
      webHostSensors.subscribeOrientation(() => {}),
      webHostSensors.subscribeAbsoluteOrientation(() => {}),
      webHostSensors.subscribeMagnetometer(() => {}),
      webHostSensors.subscribeAmbientLight(() => {}),
      webHostSensors.subscribeBarometer(() => {}),
      webHostSensors.subscribeProximity(() => {}),
      webHostSensors.subscribeQuaternion(() => {}),
    ];
    expect(() => unsubs.forEach((u) => u())).not.toThrow();
  });

  it('resolves a permission request without throwing', async () => {
    expect(typeof (await webHostSensors.requestPermission())).toBe('boolean');
  });

  it('resolves permission state without throwing', async () => {
    const state = await webHostSensors.getPermissionState();
    expect(['granted', 'denied', 'prompt', 'unsupported']).toContain(state);
  });
});
