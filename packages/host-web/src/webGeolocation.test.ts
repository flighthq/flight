import {
  explainGeolocationBackend,
  getGeolocationBackend,
  resetGeolocationBackendForTest,
} from '@flighthq/geolocation/contract';

import { enableHostWebGeolocation, resetHostWebGeolocationForTest } from './webGeolocation';

describe('enableHostWebGeolocation', () => {
  afterEach(() => {
    resetHostWebGeolocationForTest();
    resetGeolocationBackendForTest();
    vi.unstubAllGlobals();
  });

  it('delegates availability to the Web provider and records the observation', () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: true });
    enableHostWebGeolocation();
    expect(getGeolocationBackend().isAvailable()).toBe(true);
    expect(explainGeolocationBackend()).toMatchObject({
      operation: 'isAvailable',
      viability: 'available',
    });
  });

  it('does not throw on first call', () => {
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebGeolocation();
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });

  it('forwards an insecure-context result as unavailable', () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: false });
    enableHostWebGeolocation();
    expect(getGeolocationBackend().isAvailable()).toBe(false);
    expect(explainGeolocationBackend()).toMatchObject({
      operation: 'isAvailable',
      viability: 'runtime-api-unavailable',
    });
  });
});

describe('resetHostWebGeolocationForTest', () => {
  afterEach(() => {
    resetHostWebGeolocationForTest();
    resetGeolocationBackendForTest();
  });

  it('allows re-enabling after reset', () => {
    enableHostWebGeolocation();
    resetHostWebGeolocationForTest();
    expect(() => enableHostWebGeolocation()).not.toThrow();
  });
});
