import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  GeolocationAccessOutcome,
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationPermissionState,
  GeolocationRequestOptions,
  GeoPosition,
  GeoPositionResult,
} from '@flighthq/types/contract';

export function clearGeolocationWatch(id: number): void {
  getGeolocationBackend().clearWatch(id);
}

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
    isAvailable() {
      if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
      return getWebGeolocation() !== null;
    },
    // The web has no permission-request API: the prompt is raised as a side effect of a position
    // read. Code 1 is a refusal; code 3 is an acquisition TIMEOUT and says nothing about the user, so
    // it is reported as such rather than guessed at. 'dismissed' is reachable only on hosts that can
    // actually observe a closed-undecided prompt, which the web cannot.
    promptForAccess() {
      return new Promise<GeolocationAccessOutcome>((resolve) => {
        const geo = getWebGeolocation();
        if (geo === null || typeof geo.getCurrentPosition !== 'function') {
          resolve({ reason: 'runtime-unavailable' });
          return;
        }
        try {
          geo.getCurrentPosition(
            () => resolve({ reason: 'granted' }),
            (error) => resolve({ reason: mapWebAccessError(error) }),
          );
        } catch {
          resolve({ reason: 'operation-failed' });
        }
      });
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

export function explainGeolocationBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getCurrentGeoPosition(options?: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null> {
  return getGeolocationBackend().getCurrentPosition(options ?? _emptyOptions);
}

export function getCurrentGeoPositionResult(options?: Readonly<GeolocationRequestOptions>): Promise<GeoPositionResult> {
  return getGeolocationBackend().getCurrentPositionResult(options ?? _emptyOptions);
}

export function getGeolocationBackend(): GeolocationBackend {
  return _custom ?? _host ?? _sentinel;
}

export function getGeolocationPermission(): Promise<GeolocationPermissionState> {
  return getGeolocationBackend().getPermission();
}

export function installGeolocationHostBackend(backend: GeolocationBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function isGeolocationAvailable(): boolean {
  return getGeolocationBackend().isAvailable();
}

export function observeGeolocationHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function onGeolocationPermissionChange(listener: (state: GeolocationPermissionState) => void): () => void {
  return getGeolocationBackend().subscribePermission(listener);
}

export function requestGeolocationPermission(): Promise<boolean> {
  return getGeolocationBackend().requestPermission();
}

export function resetGeolocationBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setGeolocationBackend(backend: GeolocationBackend | null): void {
  _custom = backend;
}

export function watchGeolocationPosition(
  handler: (position: Readonly<GeoPosition>) => void,
  options?: Readonly<GeolocationRequestOptions>,
  onError?: (reason: GeolocationErrorReason) => void,
): number {
  return getGeolocationBackend().watchPosition(handler, options ?? _emptyOptions, onError);
}

let _custom: GeolocationBackend | null = null;
let _host: GeolocationBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
const _emptyOptions: GeolocationRequestOptions = {};
const _noopUnsubscribe = () => {};

const _sentinel: GeolocationBackend = {
  clearWatch() {},
  getCurrentPosition() {
    return Promise.resolve(null);
  },
  getCurrentPositionResult() {
    return Promise.resolve({ position: null, reason: 'unavailable' as const });
  },
  getPermission() {
    return Promise.resolve('prompt' as GeolocationPermissionState);
  },
  isAvailable() {
    return false;
  },
  promptForAccess() {
    return Promise.resolve({ reason: 'runtime-unavailable' as const });
  },
  requestPermission() {
    return Promise.resolve(false);
  },
  subscribePermission() {
    return _noopUnsubscribe;
  },
  watchPosition() {
    return -1;
  },
};

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

function mapWebAccessError(error: GeolocationPositionError): GeolocationAccessOutcome['reason'] {
  switch (error.code) {
    case 1:
      return 'denied';
    case 3:
      return 'timeout';
    default:
      return 'operation-failed';
  }
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
