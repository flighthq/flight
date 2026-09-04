import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  GeolocationAccessOutcome,
  GeolocationBackend,
  GeolocationErrorReason,
  GeolocationRequestOptions,
  GeoPosition,
  GeoPositionResult,
  HasSystemGeolocation,
} from '@flighthq/types/contract';

export function clearGeolocationWatch(host: Readonly<HasSystemGeolocation>, id: number): void {
  host.system.geolocation.clearWatch(id);
}

export function createGeoPosition(): GeoPosition {
    const out = allocateEntity<void>();
  out.accuracy = 0;
  out.altitude = 0;
  out.altitudeAccuracy = 0;
  out.floorLevel = 0;
  out.heading = 0;
  out.latitude = 0;
  out.longitude = 0;
  out.speed = 0;
  out.timestamp = 0;
  return finishEntity(out);
}

export function createWebGeolocationBackend(): GeolocationBackend {
    const out = allocateEntity<GeolocationBackend>();
  out.clearWatch = (id) => {
      const geo = getWebGeolocation();
      if (geo === null || typeof geo.clearWatch !== 'function') return;
      try {
        geo.clearWatch(id);
      } catch {
        // Expected failure: the watch may already be gone or the host may deny access.
      }
    };
  out.getCurrentPosition = (options) => {
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
    };
  out.getCurrentPositionResult = (options) => {
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
    };
  out.isAvailable = () => {
      if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
      return getWebGeolocation() !== null;
    };
  out.promptForAccess = () => {
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
    };
  out.watchPosition = (listener, options, onError) => {
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
    };
  return finishEntity(out);
}

export function getCurrentGeoPosition(
  host: Readonly<HasSystemGeolocation>,
  options?: Readonly<GeolocationRequestOptions>,
): Promise<GeoPosition | null> {
  return host.system.geolocation.getCurrentPosition(options ?? _emptyOptions);
}

export function getCurrentGeoPositionResult(
  host: Readonly<HasSystemGeolocation>,
  options?: Readonly<GeolocationRequestOptions>,
): Promise<GeoPositionResult> {
  return host.system.geolocation.getCurrentPositionResult(options ?? _emptyOptions);
}

export function isGeolocationAvailable(host: Readonly<HasSystemGeolocation>): boolean {
  return host.system.geolocation.isAvailable();
}

export function watchGeolocationPosition(
  host: Readonly<HasSystemGeolocation>,
  handler: (position: Readonly<GeoPosition>) => void,
  options?: Readonly<GeolocationRequestOptions>,
  onError?: (reason: GeolocationErrorReason) => void,
): number {
  return host.system.geolocation.watchPosition(handler, options ?? _emptyOptions, onError);
}

const _emptyOptions: GeolocationRequestOptions = {};

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

function mapWebPosition(position: Readonly<GlobalGeolocationPosition>): GeoPosition {
  const coords = position.coords;
    const out = allocateEntity<void>();
  out.accuracy = coords.accuracy;
  out.altitude = coords.altitude ?? 0;
  out.altitudeAccuracy = coords.altitudeAccuracy ?? 0;
  out.floorLevel = (coords as { floorLevel?: number }).floorLevel ?? 0;
  out.heading = coords.heading ?? 0;
  out.latitude = coords.latitude;
  out.longitude = coords.longitude;
  out.speed = coords.speed ?? 0;
  out.timestamp = position.timestamp;
  return finishEntity(out);
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

type GlobalGeolocationPosition = GeolocationPosition;
