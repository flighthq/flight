import type { GeolocationBackend, GeolocationRequestOptions, GeoPosition } from '@flighthq/types';

// Cancels an active position watch. No-op when the id is unknown or the backend lacks watching.
export function clearGeoWatch(id: number): void {
  getGeolocationBackend().clearWatch(id);
}

// Allocates a zeroed GeoPosition; use as a scratch value or when building a backend.
export function createGeoPosition(): GeoPosition {
  return {
    latitude: 0,
    longitude: 0,
    accuracy: 0,
    altitude: 0,
    altitudeAccuracy: 0,
    heading: 0,
    speed: 0,
    timestamp: 0,
  };
}

// Builds the default web backend over navigator.geolocation. Position reads resolve to null and
// permission requests resolve to false when the API is absent (insecure context, jsdom) or the user
// denies access — location access is not guaranteed.
export function createWebGeolocationBackend(): GeolocationBackend {
  return {
    getCurrentPosition(options) {
      return new Promise((resolve) => {
        const geo = getWebGeolocation();
        if (geo === null || typeof geo.getCurrentPosition !== 'function') {
          resolve(null);
          return;
        }
        try {
          geo.getCurrentPosition(
            (position) => resolve(mapWebPosition(position)),
            () => resolve(null),
            toPositionOptions(options),
          );
        } catch {
          resolve(null);
        }
      });
    },
    watchPosition(listener, options) {
      const geo = getWebGeolocation();
      if (geo === null || typeof geo.watchPosition !== 'function') return -1;
      try {
        return geo.watchPosition(
          (position) => listener(mapWebPosition(position)),
          undefined,
          toPositionOptions(options),
        );
      } catch {
        return -1;
      }
    },
    clearWatch(id) {
      const geo = getWebGeolocation();
      if (geo === null || typeof geo.clearWatch !== 'function') return;
      try {
        geo.clearWatch(id);
      } catch {
        // Expected failure: the watch may already be gone or the host may deny access.
      }
    },
    async requestPermission() {
      const permissions = typeof navigator !== 'undefined' ? (navigator.permissions ?? null) : null;
      if (permissions !== null && typeof permissions.query === 'function') {
        try {
          const status = await permissions.query({ name: 'geolocation' });
          return status.state === 'granted';
        } catch {
          // Fall through to a probe below.
        }
      }
      return (await this.getCurrentPosition({})) !== null;
    },
  };
}

// Resolves the device's current position, or null when access is denied or unavailable.
export function getCurrentGeoPosition(options?: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null> {
  return getGeolocationBackend().getCurrentPosition(options ?? _emptyOptions);
}

// The active geolocation backend, or a lazily-created web default. There is always a backend.
export function getGeolocationBackend(): GeolocationBackend {
  if (_backend === null) _backend = createWebGeolocationBackend();
  return _backend;
}

// Requests location permission. Resolves true when granted, false when denied or unavailable.
export function requestGeolocationPermission(): Promise<boolean> {
  return getGeolocationBackend().requestPermission();
}

// Installs a native host geolocation backend; pass null to fall back to the web default.
export function setGeolocationBackend(backend: GeolocationBackend | null): void {
  _backend = backend;
}

// Starts a position watch, invoking handler on each update. Returns the watch id, or -1 when
// watching is unavailable. Pair with clearGeoWatch.
export function watchGeoPosition(
  handler: (position: Readonly<GeoPosition>) => void,
  options?: Readonly<GeolocationRequestOptions>,
): number {
  return getGeolocationBackend().watchPosition(handler, options ?? _emptyOptions);
}

let _backend: GeolocationBackend | null = null;
const _emptyOptions: GeolocationRequestOptions = {};

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

function mapWebPosition(position: Readonly<GlobalGeolocationPosition>): GeoPosition {
  const coords = position.coords;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude ?? 0,
    altitudeAccuracy: coords.altitudeAccuracy ?? 0,
    heading: coords.heading ?? 0,
    speed: coords.speed ?? 0,
    timestamp: position.timestamp,
  };
}

function toPositionOptions(options: Readonly<GeolocationRequestOptions>): PositionOptions {
  return {
    enableHighAccuracy: options.enableHighAccuracy ?? false,
    timeout: options.timeoutMs,
    maximumAge: options.maximumAgeMs,
  };
}

// Local alias for the lib.dom global so source never references the colliding name directly.
type GlobalGeolocationPosition = GeolocationPosition;
