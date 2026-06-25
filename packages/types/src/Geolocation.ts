// Geolocation seam. Free functions in @flighthq/geolocation delegate to the active GeolocationBackend
// (web default over navigator.geolocation, or a native host's). Position reads resolve to null and
// permission requests resolve to false when the host denies or lacks access rather than throwing —
// location access is an expected-failure surface, not a programmer error.

// A plain snapshot of a device location. Named GeoPosition to avoid colliding with the lib.dom
// GeolocationPosition / GeolocationCoordinates global types. Fields are zeroed when unknown.
export interface GeoPosition {
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

// Current permission state. 'prompt' means the user has not yet been asked.
export type GeolocationPermissionState = 'granted' | 'denied' | 'prompt';

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

export interface GeolocationBackend {
  getCurrentPosition(options: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null>;
  getCurrentPositionResult(options: Readonly<GeolocationRequestOptions>): Promise<GeoPositionResult>;
  getPermission(): Promise<GeolocationPermissionState>;
  watchPosition(
    listener: (position: Readonly<GeoPosition>) => void,
    options: Readonly<GeolocationRequestOptions>,
    onError?: (reason: GeolocationErrorReason) => void,
  ): number;
  clearWatch(id: number): void;
  requestPermission(): Promise<boolean>;
  subscribePermission(listener: (state: GeolocationPermissionState) => void): () => void;
}
