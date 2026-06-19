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
  heading: number;
  speed: number;
  timestamp: number;
}

export interface GeolocationRequestOptions {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
}

export interface GeolocationBackend {
  getCurrentPosition(options: Readonly<GeolocationRequestOptions>): Promise<GeoPosition | null>;
  watchPosition(
    listener: (position: Readonly<GeoPosition>) => void,
    options: Readonly<GeolocationRequestOptions>,
  ): number;
  clearWatch(id: number): void;
  requestPermission(): Promise<boolean>;
}
