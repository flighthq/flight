import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  GeolocationAccessOutcome,
  HostGeolocationProvider,
  GeolocationErrorReason,
  GeolocationPosition as FlightGeolocationPosition,
  GeolocationPositionResult,
  GeolocationRequestOptions,
  EntityConstruction,
} from '@flighthq/types/contract';

export function clearGeolocationWatch(hostGeolocation: Readonly<HostGeolocationProvider>, id: number): void {
  hostGeolocation.clearWatch(id);
}

export function createGeolocationPosition(): FlightGeolocationPosition {
  const out = allocateEntity<FlightGeolocationPosition>();
  initializeGeolocationPosition(out);
  return finishEntity(out);
}

export function createWebGeolocationBackend(): HostGeolocationProvider {
  const out = allocateEntity<HostGeolocationProvider>();
  initializeWebGeolocationBackend(out);
  return finishEntity(out);
}

export function getCurrentGeolocationPosition(
  hostGeolocation: Readonly<HostGeolocationProvider>,
  options?: Readonly<GeolocationRequestOptions>,
): Promise<FlightGeolocationPosition | null> {
  return hostGeolocation.getCurrentPosition(options ?? _emptyOptions);
}

export function getCurrentGeolocationPositionResult(
  hostGeolocation: Readonly<HostGeolocationProvider>,
  options?: Readonly<GeolocationRequestOptions>,
): Promise<GeolocationPositionResult> {
  return hostGeolocation.getCurrentPositionResult(options ?? _emptyOptions);
}

export function initializeGeolocationPosition(out: EntityConstruction<FlightGeolocationPosition>): void {
  out.accuracy = 0;
  out.altitude = 0;
  out.altitudeAccuracy = 0;
  out.floorLevel = 0;
  out.heading = 0;
  out.latitude = 0;
  out.longitude = 0;
  out.speed = 0;
  out.timestamp = 0;
}

export function initializeWebGeolocationBackend(out: EntityConstruction<HostGeolocationProvider>): void {
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
}

export function isGeolocationAvailable(hostGeolocation: Readonly<HostGeolocationProvider>): boolean {
  return hostGeolocation.isAvailable();
}

export function watchGeolocationPosition(
  hostGeolocation: Readonly<HostGeolocationProvider>,
  handler: (position: Readonly<FlightGeolocationPosition>) => void,
  options?: Readonly<GeolocationRequestOptions>,
  onError?: (reason: GeolocationErrorReason) => void,
): number {
  return hostGeolocation.watchPosition(handler, options ?? _emptyOptions, onError);
}

const _emptyOptions: GeolocationRequestOptions = {};

function getWebGeolocation(): Geolocation | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.geolocation ?? null;
}

function mapWebPosition(position: Readonly<GlobalGeolocationPosition>): FlightGeolocationPosition {
  const coords = position.coords;
  const out = allocateEntity<FlightGeolocationPosition>();
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
