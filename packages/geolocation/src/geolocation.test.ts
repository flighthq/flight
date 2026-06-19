import type { GeolocationBackend, GeoPosition } from '@flighthq/types';

import {
  clearGeoWatch,
  createGeoPosition,
  createWebGeolocationBackend,
  getCurrentGeoPosition,
  getGeolocationBackend,
  requestGeolocationPermission,
  setGeolocationBackend,
  watchGeoPosition,
} from './geolocation';

function fakeBackend(): GeolocationBackend & { cleared: number[]; lastWatch: number } {
  return {
    cleared: [],
    lastWatch: 0,
    async getCurrentPosition() {
      const position = createGeoPosition();
      position.latitude = 1;
      position.longitude = 2;
      return position;
    },
    watchPosition(listener) {
      const position = createGeoPosition();
      position.latitude = 3;
      listener(position);
      return ++this.lastWatch;
    },
    clearWatch(id) {
      this.cleared.push(id);
    },
    async requestPermission() {
      return true;
    },
  };
}

afterEach(() => setGeolocationBackend(null));

describe('clearGeoWatch', () => {
  it('forwards the id to the active backend', () => {
    const backend = fakeBackend();
    setGeolocationBackend(backend);
    clearGeoWatch(7);
    expect(backend.cleared).toEqual([7]);
  });

  it('does not throw on the web backend in jsdom', () => {
    expect(() => clearGeoWatch(0)).not.toThrow();
  });
});

describe('createGeoPosition', () => {
  it('allocates a zeroed position', () => {
    expect(createGeoPosition()).toEqual({
      latitude: 0,
      longitude: 0,
      accuracy: 0,
      altitude: 0,
      altitudeAccuracy: 0,
      heading: 0,
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
});

describe('getCurrentGeoPosition', () => {
  it('returns the backend position', async () => {
    setGeolocationBackend(fakeBackend());
    const position = (await getCurrentGeoPosition()) as GeoPosition;
    expect(position.latitude).toBe(1);
    expect(position.longitude).toBe(2);
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

  it('returns -1 from the web backend when watching is unavailable', () => {
    expect(watchGeoPosition(() => {})).toBe(-1);
  });
});
