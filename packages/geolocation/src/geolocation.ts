import type {
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationPermissionState,
  GeolocationRequestOptions,
  GeoPosition,
  GeoPositionResult,
} from '@flighthq/types';

// Cancels an active position watch. No-op when the id is unknown or the backend lacks watching.
export function clearGeolocationWatch(id: number): void {
  getGeolocationBackend().clearWatch(id);
}

// Allocates a zeroed GeoPosition; use as a scratch value or when building a backend.
export function createGeoPosition(): GeoPosition {
  return {
    accuracy: 0,
    altitude: 0,
    altitudeAccuracy: 0,
    floorLevel: 0,
    heading: 0,
    latitude: 0,
    longitude: 0,
    speed: 0,
    timestamp: 0,
  };
}

// Builds the default web backend over navigator.geolocation. Position reads resolve to null and
// permission requests resolve to false when the API is absent (insecure context, jsdom) or the user
// denies access — location access is not guaranteed.
export function createWebGeolocationBackend(): GeolocationBackend {
  return {
    clearWatch(id) {
      const geo = getWebGeolocation();
      if (geo === null || typeof geo.clearWatch !== 'function') return;
      try {
        geo.clearWatch(id);
      } catch {
        // Expected failure: the watch may already be gone or the host may deny access.
      }
    },
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
    getCurrentPositionResult(options) {
      return new Promise((resolve) => {
        const geo = getWebGeolocation();
        if (geo === null || typeof geo.getCurrentPosition !== 'function') {
          resolve({ position: null, reason: 'unavailable' });
          return;
        }
        try {
          geo.getCurrentPosition(
            (position) => resolve({ position: mapWebPosition(position), reason: null }),
            (error) => resolve({ position: null, reason: mapWebPositionError(error) }),
            toPositionOptions(options),
          );
        } catch {
          resolve({ position: null, reason: 'unavailable' });
        }
      });
    },
    async getPermission() {
      const permissions = typeof navigator !== 'undefined' ? (navigator.permissions ?? null) : null;
      if (permissions !== null && typeof permissions.query === 'function') {
        try {
          const status = await permissions.query({ name: 'geolocation' });
          return status.state as GeolocationPermissionState;
        } catch {
          // Fall through to prompt default.
        }
      }
      return 'prompt';
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
    subscribePermission(listener) {
      const permissions = typeof navigator !== 'undefined' ? (navigator.permissions ?? null) : null;
      if (permissions === null || typeof permissions.query !== 'function') return _noopUnsubscribe;
      let status: PermissionStatus | null = null;
      let handler: (() => void) | null = null;
      permissions
        .query({ name: 'geolocation' })
        .then((s) => {
          status = s;
          handler = () => listener(s.state as GeolocationPermissionState);
          s.addEventListener('change', handler);
        })
        .catch(() => {
          // Permissions API unavailable; subscription is a no-op.
        });
      return () => {
        if (status !== null && handler !== null) {
          status.removeEventListener('change', handler);
          status = null;
          handler = null;
        }
      };
    },
    watchPosition(listener, options, onError) {
      const geo = getWebGeolocation();
      if (geo === null || typeof geo.watchPosition !== 'function') return -1;
      try {
        return geo.watchPosition(
          (position) => listener(mapWebPosition(position)),
          onError !== undefined ? (error) => onError(mapWebPositionError(error)) : () => {},
          toPositionOptions(options),
        );
      } catch {
        return -1;
      }
    },
  };
}

// Resolves the device's current position, or null when access is denied or unavailable.
export function getCurrentGeoPosition(options?: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null> {
  return getGeolocationBackend().getCurrentPosition(options ?? _emptyOptions);
}

// Resolves a GeoPositionResult carrying both the position and the error reason on failure.
// Use when the caller needs to distinguish denied / unavailable / timeout rather than just null.
export function getCurrentGeoPositionResult(options?: Readonly<GeolocationRequestOptions>): Promise<GeoPositionResult> {
  return getGeolocationBackend().getCurrentPositionResult(options ?? _emptyOptions);
}

// The active geolocation backend, or a lazily-created web default. There is always a backend.
export function getGeolocationBackend(): GeolocationBackend {
  if (_backend === null) _backend = createWebGeolocationBackend();
  return _backend;
}

// Resolves the current permission state without triggering a user prompt.
// Returns 'granted', 'denied', or 'prompt' (the user has not yet been asked).
// Falls back to 'prompt' when the Permissions API is absent.
export function getGeolocationPermission(): Promise<GeolocationPermissionState> {
  return getGeolocationBackend().getPermission();
}

// Returns true when the geolocation capability is available in the current context. Synchronous;
// does not trigger a permission prompt. False on insecure context, jsdom, or missing navigator.
export function isGeolocationAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
  return typeof navigator.geolocation !== 'undefined' && navigator.geolocation !== null;
}

// Subscribes to geolocation permission state changes. Invokes listener whenever the OS changes the
// permission (e.g., the user revokes access in Settings mid-session). Returns an unsubscribe
// function. No-op subscription when the Permissions API is absent.
export function onGeolocationPermissionChange(listener: (state: GeolocationPermissionState) => void): () => void {
  return getGeolocationBackend().subscribePermission(listener);
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
// watching is unavailable. Pair with clearGeolocationWatch.
// Pass onError to receive ongoing failure reasons (e.g., permission revoked mid-watch).
export function watchGeolocationPosition(
  handler: (position: Readonly<GeoPosition>) => void,
  options?: Readonly<GeolocationRequestOptions>,
  onError?: (reason: GeolocationErrorReason) => void,
): number {
  return getGeolocationBackend().watchPosition(handler, options ?? _emptyOptions, onError);
}

let _backend: GeolocationBackend | null = null;
const _emptyOptions: GeolocationRequestOptions = {};
const _noopUnsubscribe = () => {};

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

function mapWebPosition(position: Readonly<GlobalGeolocationPosition>): GeoPosition {
  const coords = position.coords;
  return {
    accuracy: coords.accuracy,
    altitude: coords.altitude ?? 0,
    altitudeAccuracy: coords.altitudeAccuracy ?? 0,
    // floorLevel is non-standard: absent from the W3C GeolocationCoordinates type, but some hosts
    // (indoor-positioning platforms) populate it. Read it when present rather than forcing 0.
    floorLevel: (coords as { floorLevel?: number }).floorLevel ?? 0,
    heading: coords.heading ?? 0,
    latitude: coords.latitude,
    longitude: coords.longitude,
    speed: coords.speed ?? 0,
    timestamp: position.timestamp,
  };
}

function mapWebPositionError(error: GeolocationPositionError): GeolocationErrorReason {
  switch (error.code) {
    case 1:
      return 'denied';
    case 3:
      return 'timeout';
    default:
      return 'unavailable';
  }
}

function toPositionOptions(options: Readonly<GeolocationRequestOptions>): PositionOptions {
  return {
    enableHighAccuracy: options.enableHighAccuracy ?? false,
    maximumAge: options.maximumAgeMs,
    timeout: options.timeoutMs,
  };
}

// Local alias for the lib.dom global so source never references the colliding name directly.
type GlobalGeolocationPosition = GeolocationPosition;
