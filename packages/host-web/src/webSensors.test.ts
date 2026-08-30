import { webSensorsBackend } from './webSensors';

describe('webSensorsBackend', () => {
  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webSensors')).webSensorsBackend;
    expect(again).toBe(webSensorsBackend);
  });

  it('answers every support query without throwing', () => {
    for (const query of [
      webSensorsBackend.isMotionSupported,
      webSensorsBackend.isOrientationSupported,
      webSensorsBackend.isBarometerSupported,
      webSensorsBackend.isProximitySupported,
    ]) {
      expect(typeof query.call(webSensorsBackend)).toBe('boolean');
    }
  });
});
