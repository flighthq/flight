import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWebGeolocationBackend, initializeWebGeolocationBackend, webHostGeolocation } from './webGeolocation';

describe('createWebGeolocationBackend', () => {
  it('resolves null and does not throw when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    expect(await backend.getCurrentPosition({})).toBeNull();
    expect(typeof backend.watchPosition(() => {}, {})).toBe('number');
    expect(() => backend.clearWatch(-1)).not.toThrow();
  });

  it('getCurrentPositionResult returns unavailable reason when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    const result = await backend.getCurrentPositionResult({});
    expect(result.position).toBeNull();
    expect(result.reason).toBe('unavailable');
  });

  it('reads a host-provided floorLevel from coords', async () => {
    const hadOwn = Object.prototype.hasOwnProperty.call(navigator, 'geolocation');
    const original =
      Object.getOwnPropertyDescriptor(navigator, 'geolocation') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (position: unknown) => void) {
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              floorLevel: 3,
              heading: null,
              latitude: 1,
              longitude: 2,
              speed: null,
            },
            timestamp: 123,
          });
        },
      },
    });
    try {
      const backend = createWebGeolocationBackend();
      const position = await backend.getCurrentPosition({});
      expect(position?.floorLevel).toBe(3);
    } finally {
      if (hadOwn && original !== undefined) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as { geolocation?: unknown }).geolocation;
      }
    }
  });

  it('reports availability only when geolocation exists in a secure context', () => {
    const backend = createWebGeolocationBackend();
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: true });
    expect(backend.isAvailable()).toBe(true);

    vi.stubGlobal('window', { isSecureContext: false });
    expect(backend.isAvailable()).toBe(false);

    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { isSecureContext: true });
    expect(backend.isAvailable()).toBe(false);
  });

  afterEach(() => vi.unstubAllGlobals());
});

describe('initializeWebGeolocationBackend', () => {
  it('is the construction initializer of createWebGeolocationBackend', () => {
    expect(typeof initializeWebGeolocationBackend).toBe('function');
  });
});

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
