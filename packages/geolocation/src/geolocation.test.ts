import type {
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationPermissionState,
  GeoPosition,
} from '@flighthq/types/contract';

import {
  clearGeolocationWatch,
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
  watchGeolocationPosition,
  explainGeolocationBackend,
  installGeolocationHostBackend,
  observeGeolocationHostResult,
  resetGeolocationBackendForTest,
} from './geolocation';

function fakeBackend(available: boolean = true): GeolocationBackend & { cleared: number[]; lastWatch: number } {
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
    isAvailable() {
      return available;
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

afterEach(() => {
  resetGeolocationBackendForTest();
  vi.unstubAllGlobals();
});

describe('clearGeolocationWatch', () => {
  it('does not throw on the web backend in jsdom', () => {
    expect(() => clearGeolocationWatch(0)).not.toThrow();
  });

  it('forwards the id to the active backend', () => {
    const backend = fakeBackend();
    setGeolocationBackend(backend);
    clearGeolocationWatch(7);
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
});

describe('explainGeolocationBackend', () => {
  afterEach(() => resetGeolocationBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetGeolocationBackendForTest();
    const explanation = explainGeolocationBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setGeolocationBackend(fakeBackend());
    expect(explainGeolocationBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installGeolocationHostBackend(fakeBackend());
    expect(explainGeolocationBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installGeolocationHostBackend(fakeBackend());
    installGeolocationHostBackend(fakeBackend());
    expect(explainGeolocationBackend().conflict).toBe(true);
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

describe('installGeolocationHostBackend', () => {
  afterEach(() => resetGeolocationBackendForTest());

  it('installs a host backend that getGeolocationBackend returns', () => {
    const backend = fakeBackend();
    installGeolocationHostBackend(backend);
    expect(getGeolocationBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installGeolocationHostBackend(first);
    installGeolocationHostBackend(second);
    expect(getGeolocationBackend()).toBe(first);
    expect(explainGeolocationBackend().conflict).toBe(true);
  });
});

describe('isGeolocationAvailable', () => {
  it('returns the false sentinel even when browser geolocation exists', () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: true });
    expect(isGeolocationAvailable()).toBe(false);
  });

  it('routes a custom available provider when DOM globals are absent', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('window', undefined);
    setGeolocationBackend(fakeBackend(true));
    expect(isGeolocationAvailable()).toBe(true);
  });

  it('routes an unavailable host provider when browser geolocation exists', () => {
    vi.stubGlobal('navigator', { geolocation: {} });
    vi.stubGlobal('window', { isSecureContext: true });
    installGeolocationHostBackend(fakeBackend(false));
    expect(isGeolocationAvailable()).toBe(false);
  });
});

describe('observeGeolocationHostResult', () => {
  afterEach(() => resetGeolocationBackendForTest());

  it('records a successful observation', () => {
    installGeolocationHostBackend(fakeBackend());
    observeGeolocationHostResult('clearWatch', true);
    const explanation = explainGeolocationBackend();
    expect(explanation.operation).toBe('clearWatch');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installGeolocationHostBackend(fakeBackend());
    observeGeolocationHostResult('clearWatch', false);
    expect(explainGeolocationBackend().viability).toBe('runtime-api-unavailable');
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

describe('resetGeolocationBackendForTest', () => {
  it('clears all backend slots', () => {
    setGeolocationBackend(fakeBackend());
    installGeolocationHostBackend(fakeBackend());
    observeGeolocationHostResult('clearWatch', true);
    resetGeolocationBackendForTest();
    expect(explainGeolocationBackend().layer).toBe('host-not-enabled');
    expect(explainGeolocationBackend().conflict).toBe(false);
    expect(explainGeolocationBackend().viability).toBe('unobserved');
  });
});

describe('setGeolocationBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setGeolocationBackend(fakeBackend());
    setGeolocationBackend(null);
    expect(getGeolocationBackend()).not.toBeNull();
  });
});

describe('watchGeolocationPosition', () => {
  it('delivers positions and returns a watch id', () => {
    setGeolocationBackend(fakeBackend());
    let seen = 0;
    const id = watchGeolocationPosition((position) => {
      seen = position.latitude;
    });
    expect(id).toBe(1);
    expect(seen).toBe(3);
  });

  it('delivers error reasons when onError is provided', () => {
    setGeolocationBackend(fakeBackend());
    const errors: GeolocationErrorReason[] = [];
    watchGeolocationPosition(
      () => {},
      {},
      (reason) => errors.push(reason),
    );
    expect(errors).toEqual(['denied']);
  });

  it('returns -1 from the web backend when watching is unavailable', () => {
    expect(watchGeolocationPosition(() => {})).toBe(-1);
  });
});
