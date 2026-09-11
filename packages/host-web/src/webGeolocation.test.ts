import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webHostGeolocation } from './webGeolocation';

describe('webHostGeolocation', () => {
  it('is a HostGeolocationProvider entity', () => {
    expect(Object.hasOwn(webHostGeolocation, EntityRuntimeKey)).toBe(true);
    expect(typeof webHostGeolocation.isAvailable).toBe('function');
    expect(typeof webHostGeolocation.getCurrentPosition).toBe('function');
    expect(typeof webHostGeolocation.getCurrentPositionResult).toBe('function');
    expect(typeof webHostGeolocation.watchPosition).toBe('function');
    expect(typeof webHostGeolocation.clearWatch).toBe('function');
    expect(typeof webHostGeolocation.promptForAccess).toBe('function');
  });
});
