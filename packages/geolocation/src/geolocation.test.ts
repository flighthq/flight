import type {
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationPermissionState,
  GeoPosition,
} from '@flighthq/types';

import {
  clearGeoWatch,
  createGeoPosition,
  createWebGeolocationBackend,
  getCurrentGeoPosition,
  getCurrentGeoPositionResult,
  getGeolocationBackend,
  getGeolocationPermission,
  isGeolocationAvailable,
  onGeolocationPermissionChange,
  requestGeolocationPermission,
  setGeolocationBackend,
  watchGeoPosition,
} from './geolocation';

function fakeBackend(): GeolocationBackend & { cleared: number[]; lastWatch: number } {
  return {
    cleared: [],
    lastWatch: 0,
    clearWatch(id) {
      this.cleared.push(id);
    },
    async getCurrentPosition() {
      const position = createGeoPosition();
      position.latitude = 1;
      position.longitude = 2;
      return position;
    },
    async getCurrentPositionResult() {
      const position = createGeoPosition();
      position.latitude = 1;
      position.longitude = 2;
      return { position, reason: null };
    },
    async getPermission(): Promise<GeolocationPermissionState> {
      return 'granted';
    },
    async requestPermission() {
      return true;
    },
    subscribePermission(_listener: (state: GeolocationPermissionState) => void) {
      return () => {};
    },
    watchPosition(listener, _options, onError) {
      const position = createGeoPosition();
      position.latitude = 3;
      listener(position);
      if (onError) onError('denied');
      return ++this.lastWatch;
    },
  };
}

afterEach(() => setGeolocationBackend(null));

describe('clearGeoWatch', () => {
  it('does not throw on the web backend in jsdom', () => {
    expect(() => clearGeoWatch(0)).not.toThrow();
  });

  it('forwards the id to the active backend', () => {
    const backend = fakeBackend();
    setGeolocationBackend(backend);
    clearGeoWatch(7);
    expect(backend.cleared).toEqual([7]);
  });
});

describe('createGeoPosition', () => {
  it('allocates a zeroed position', () => {
    expect(createGeoPosition()).toEqual({
      accuracy: 0,
      altitude: 0,
      altitudeAccuracy: 0,
      floorLevel: 0,
      heading: 0,
      latitude: 0,
      longitude: 0,
      speed: 0,
      timestamp: 0,
    });
  });
});

describe('createWebGeolocationBackend', () => {
  it('resolves null and does not throw when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    expect(await backend.getCurrentPosition({})).toBeNull();
    expect(typeof backend.watchPosition(() => {}, {})).toBe('number');
    expect(() => backend.clearWatch(-1)).not.toThrow();
    expect(typeof (await backend.requestPermission())).toBe('boolean');
  });

  it('getPermission returns a GeolocationPermissionState string', async () => {
    const backend = createWebGeolocationBackend();
    const state = await backend.getPermission();
    expect(['granted', 'denied', 'prompt']).toContain(state);
  });

  it('getCurrentPositionResult returns unavailable reason when geolocation is absent', async () => {
    const backend = createWebGeolocationBackend();
    const result = await backend.getCurrentPositionResult({});
    expect(result.position).toBeNull();
    expect(result.reason).toBe('unavailable');
  });

  it('subscribePermission returns an unsubscribe function', () => {
    const backend = createWebGeolocationBackend();
    const unsubscribe = backend.subscribePermission(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('getCurrentGeoPosition', () => {
  it('returns the backend position', async () => {
    setGeolocationBackend(fakeBackend());
    const position = (await getCurrentGeoPosition()) as GeoPosition;
    expect(position.latitude).toBe(1);
    expect(position.longitude).toBe(2);
  });
});

describe('getCurrentGeoPositionResult', () => {
  it('returns position and null reason on success', async () => {
    setGeolocationBackend(fakeBackend());
    const result = await getCurrentGeoPositionResult();
    expect(result.position).not.toBeNull();
    expect(result.position!.latitude).toBe(1);
    expect(result.reason).toBeNull();
  });

  it('returns null position with a reason on failure (web backend in jsdom)', async () => {
    const result = await getCurrentGeoPositionResult();
    expect(result.position).toBeNull();
    expect(result.reason).toBe('unavailable');
  });
});

describe('getGeolocationBackend', () => {
  it('falls back to a web backend', () => {
    expect(getGeolocationBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setGeolocationBackend(backend);
    expect(getGeolocationBackend()).toBe(backend);
  });
});

describe('getGeolocationPermission', () => {
  it('reflects the backend permission state', async () => {
    setGeolocationBackend(fakeBackend());
    expect(await getGeolocationPermission()).toBe('granted');
  });

  it('returns a GeolocationPermissionState string from the web backend', async () => {
    const state = await getGeolocationPermission();
    expect(['granted', 'denied', 'prompt']).toContain(state);
  });
});

describe('isGeolocationAvailable', () => {
  it('returns a boolean', () => {
    expect(typeof isGeolocationAvailable()).toBe('boolean');
  });

  it('returns false in jsdom (no secure context / no navigator.geolocation)', () => {
    // jsdom does not provide navigator.geolocation, so this is expected to be false.
    expect(isGeolocationAvailable()).toBe(false);
  });
});

describe('onGeolocationPermissionChange', () => {
  it('returns an unsubscribe function', () => {
    const unsubscribe = onGeolocationPermissionChange(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('uses the backend subscribePermission', () => {
    let subscribed = false;
    let unsubscribed = false;
    const backend = fakeBackend();
    backend.subscribePermission = (_listener) => {
      subscribed = true;
      return () => {
        unsubscribed = true;
      };
    };
    setGeolocationBackend(backend);
    const unsub = onGeolocationPermissionChange(() => {});
    expect(subscribed).toBe(true);
    unsub();
    expect(unsubscribed).toBe(true);
  });
});

describe('requestGeolocationPermission', () => {
  it('reflects the backend result', async () => {
    setGeolocationBackend(fakeBackend());
    expect(await requestGeolocationPermission()).toBe(true);
  });

  it('returns a boolean from the web backend without throwing', async () => {
    expect(typeof (await requestGeolocationPermission())).toBe('boolean');
  });
});

describe('setGeolocationBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setGeolocationBackend(fakeBackend());
    setGeolocationBackend(null);
    expect(getGeolocationBackend()).not.toBeNull();
  });
});

describe('watchGeoPosition', () => {
  it('delivers positions and returns a watch id', () => {
    setGeolocationBackend(fakeBackend());
    let seen = 0;
    const id = watchGeoPosition((position) => {
      seen = position.latitude;
    });
    expect(id).toBe(1);
    expect(seen).toBe(3);
  });

  it('delivers error reasons when onError is provided', () => {
    setGeolocationBackend(fakeBackend());
    const errors: GeolocationErrorReason[] = [];
    watchGeoPosition(
      () => {},
      {},
      (reason) => errors.push(reason),
    );
    expect(errors).toEqual(['denied']);
  });

  it('returns -1 from the web backend when watching is unavailable', () => {
    expect(watchGeoPosition(() => {})).toBe(-1);
  });
});
