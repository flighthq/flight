---
package: '@flighthq/geolocation'
crate: flighthq-geolocation
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# geolocation — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Device geolocation acquisition -- reading the device's current geographic position, watching position over time, and managing the location-permission lifecycle (query, request, live change). Flat free functions over a swappable `GeolocationBackend`, with a lazily-available web default (over `navigator.geolocation` / `navigator.permissions`) that a native host replaces via `setGeolocationBackend`. The domain ends at acquiring location from the host; geospatial computation (distance, bearing, geofencing, coordinate projection) lives outside this seam.

## Decisions

- **[2026-07-02] Use full `Geolocation*` prefix, not `Geo*`.** Per the suite-wide naming convention (names match the subject unabbreviated), all exports use the `Geolocation*` stem consistently. The split between `Geolocation*` and `Geo*` (e.g. `watchGeoPosition`, `clearGeoWatch`) is a naming bug to fix: rename to `watchGeolocationPosition` / `clearGeolocationWatch`.
- **[2026-07-02] Fix `floorLevel` bug.** `floorLevel` is hardcoded to `0` instead of reading `coords.floorLevel` from the Geolocation API. Fix to read the actual value (with `?? 0` fallback when the property is absent or the lib.dom typing has not caught up).

## Open directions

- Whether `GeoPositionResult` (sentinel + reason-carrying companion) should be a suite-wide pattern or remain geolocation-local.
- Native watch-throttling options (`minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs`) that the web backend cannot honor.
- `subscribePermission` attach-race: listener is wired only after `permissions.query()` resolves, so a change in that window is missed.
