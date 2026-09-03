// Geolocation seam. Free functions in @flighthq/geolocation delegate to the active GeolocationBackend
// (web default over navigator.geolocation, or a native host's). Position reads resolve to null and
// permission requests resolve to false when the host denies or lacks access rather than throwing —
// location access is an expected-failure surface, not a programmer error.

// A plain snapshot of a device location. Named GeoPosition to avoid colliding with the lib.dom
// GeolocationPosition / GeolocationCoordinates global types. Fields are zeroed when unknown.
export interface GeoPosition extends Entity {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number;
  altitudeAccuracy: number;
  floorLevel: number;
  heading: number;
  speed: number;
  timestamp: number;
}

// Why a position read failed. 'denied' — permission refused; 'timeout' — no fix within the deadline;
// 'unavailable' — the capability is absent (insecure context, jsdom, missing navigator).
export type GeolocationErrorReason = 'denied' | 'timeout' | 'unavailable';

// A position read paired with its failure reason. On success, position is set and reason is null;
// on failure, position is null and reason carries why.
export interface GeoPositionResult {
  position: GeoPosition | null;
  reason: GeolocationErrorReason | null;
}

export interface GeolocationRequestOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

/**
 * What happened when the capability raised its own access prompt.
 *
 * A CAPABILITY outcome, deliberately not a `PermissionState`: only the capability can raise the
 * prompt, and G6 lets it keep that mechanism precisely because what it returns carries no permission
 * vocabulary. Permissions projects this into its own outcome; nothing here names a state.
 *
 * `timeout` is an ACQUISITION observable and says nothing about the user. It occurs routinely with
 * access already granted — indoors, no fix, a slow lock — so it must never be read as a dismissal.
 * Only a permission-state query can tell those apart, and the capability may not hold one; it reports
 * what it saw and leaves the interpretation to the owner that can query.
 *
 * `cleanup-failed` means access WAS obtained and releasing the probe failed afterwards. The decision
 * survives it, so it is a distinct arm rather than a failure that discards the answer.
 */
export type GeolocationAccessOutcome = {
  readonly reason:
    | 'cleanup-failed'
    | 'denied'
    | 'dismissed'
    | 'granted'
    | 'operation-failed'
    | 'runtime-unavailable'
    | 'timeout';
};

export interface GeolocationBackend extends Entity {
  getCurrentPosition(options: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null>;
  getCurrentPositionResult(options: Readonly<GeolocationRequestOptions>): Promise<GeoPositionResult>;
  // Reports whether this provider can acquire positions now; permission denial is a separate state.
  isAvailable(): boolean;
  watchPosition(
    listener: (position: Readonly<GeoPosition>) => void,
    options: Readonly<GeolocationRequestOptions>,
    onError?: (reason: GeolocationErrorReason) => void,
  ): number;
  clearWatch(id: number): void;
  // Raises the platform's own access prompt. Named so a native host implements it with its real
  // permission API instead of emulating the web's acquire-and-discard workaround.
  promptForAccess(): Promise<GeolocationAccessOutcome>;
}
import type { Entity } from './Entity';
