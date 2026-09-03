import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webGeolocationBackend } from './webGeolocation';

describe('webGeolocationBackend', () => {
  it('is a GeolocationBackend entity', () => {
    expect(Object.hasOwn(webGeolocationBackend, EntityRuntimeKey)).toBe(true);
    expect(typeof webGeolocationBackend.isAvailable).toBe('function');
    expect(typeof webGeolocationBackend.getCurrentPosition).toBe('function');
    expect(typeof webGeolocationBackend.getCurrentPositionResult).toBe('function');
    expect(typeof webGeolocationBackend.watchPosition).toBe('function');
    expect(typeof webGeolocationBackend.clearWatch).toBe('function');
    expect(typeof webGeolocationBackend.promptForAccess).toBe('function');
  });
});
