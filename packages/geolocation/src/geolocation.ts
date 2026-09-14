import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
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
