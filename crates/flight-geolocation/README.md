# flight-geolocation

Geolocation capability seam: position reads, watches and access prompts routed through a
caller-supplied host provider. No platform location, permission or sensor API lives here.

## Precision

- Coordinates, accuracy, altitude, heading and speed are `f32` (D1 default).
- `GeolocationPosition.timestamp` and the `GeolocationRequestOptions` millisecond members
  (`timeout_ms`, `maximum_age_ms`) are `f64` millisecond values, declared here because epoch
  timestamps and deadlines exceed `f32` exactly.
