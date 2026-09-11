import { webHostSensors } from './webSensors';

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
