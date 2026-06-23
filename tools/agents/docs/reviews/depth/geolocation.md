# Depth Review: @flighthq/geolocation

**Domain:** Device geolocation — reading the device's current geographic position, watching position over time, and managing location-permission state. As a Flight Platform Integration Suite cell, the domain is deliberately scoped to _acquiring_ location from the host, not to geospatial computation (distance, bearing, geofencing math live outside this seam).

**Verdict:** solid — completeness 78/100

For a platform-integration _capability seam_ (not a general-purpose geo library), the package covers the canonical surface of the host geolocation API almost completely. It loses points only on a few real omissions in the permission/state surface and the absence of a couple of fields the W3C Geolocation API exposes.

## Present capabilities

The exported surface (`npm run api geolocation`):

- `getCurrentGeoPosition(options?)` — one-shot position read; resolves `GeoPosition | null` (null on deny/unavailable). The core read.
- `watchGeoPosition(handler, options?)` — continuous watch returning a numeric watch id (`-1` when unavailable). The core subscription.
- `clearGeoWatch(id)` — cancels a watch; no-op for unknown ids. Correctly paired with `watchGeoPosition`.
- `requestGeolocationPermission()` — resolves `true`/`false`; uses the Permissions API `query({ name: 'geolocation' })` when present, falling back to a `getCurrentPosition` probe.
- `getGeolocationBackend()` / `setGeolocationBackend(backend|null)` — the swappable backend seam (web default lazily created; native host installs its own).
- `createWebGeolocationBackend()` — the default backend over `navigator.geolocation`, with full guarding (insecure context / jsdom / missing API all resolve to sentinels rather than throwing).
- `createGeoPosition()` — zeroed scratch `GeoPosition` constructor (matches the SDK "constructor over literal" rule).

The `GeoPosition` snapshot is appropriately complete: `latitude`, `longitude`, `accuracy`, `altitude`, `altitudeAccuracy`, `heading`, `speed`, `timestamp` — a 1:1 flattening of the W3C `GeolocationCoordinates` + `timestamp`, with nullable web fields coerced to 0. `GeolocationRequestOptions` covers the full W3C option set (`enableHighAccuracy`, `timeoutMs`, `maximumAgeMs`). The web backend correctly maps these to `PositionOptions`. Error handling is consistent with the suite's sentinel philosophy throughout. Domain-correct and idiomatic for the suite pattern.

## Gaps vs an authoritative geolocation library

Measured against the canonical host-geolocation capability (W3C Geolocation API + native plugin conventions like Capacitor/Cordova Geolocation), the real omissions:

- **No permission _state_ read, only a request.** `requestGeolocationPermission()` returns a boolean, collapsing the canonical tri-state (`granted` / `denied` / `prompt`). There is no `getGeolocationPermission()` / permission-status query that returns the current state without triggering a prompt — the rest of the platform suite (`notification`, etc.) typically distinguishes "check" from "request." This is the most notable gap. (missing-by-omission)
- **No permission-change subscription.** The Permissions API exposes a `PermissionStatus.onchange`; there is no `onGeolocationPermissionChange` event hook. The Package Map classes geolocation as a _command_ capability (not an event one), so this is plausibly missing-by-design, but a permission-change signal is a recognized part of a mature geolocation surface.
- **No error/reason surface on failure.** Both reads collapse all failures to `null` / `-1`. The W3C `PositionError` distinguishes `PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, and `TIMEOUT`; an authoritative wrapper usually preserves at least which of these occurred. Flight's sentinel philosophy explains the choice, but a caller cannot tell "denied" from "timed out," which limits UX (retry vs. prompt-settings). (missing-by-design, but a real expressiveness loss)
- **No watch-error delivery.** `watchPosition`'s web error callback is wired to `undefined` — a watch that starts and then loses a fix or has permission revoked simply stops emitting, silently. An authoritative watch surfaces ongoing errors to the handler. (missing-by-omission)
- **`floorLevel` field absent.** The W3C `GeolocationCoordinates` has an optional `floorLevel` (indoor positioning); `GeoPosition` omits it. Minor. (missing-by-omission)
- **No convenience like `isGeolocationAvailable()`.** Callers must call `getGeolocationBackend()` or probe. Minor, and arguably not needed.

Notably **not** gaps (correctly out of domain for this seam): distance/bearing/haversine math, geofencing, reverse geocoding, coordinate-system conversion, mock/simulated location. These belong to geospatial-math or service packages, not a host-capability cell, so their absence is missing-by-design and correct.

## Naming / API-shape notes

- Naming is strong and consistent with the SDK rules. `GeoPosition` is a deliberate, well-documented rename to avoid colliding with the lib.dom `GeolocationPosition` global; the local `GlobalGeolocationPosition` alias keeps source from touching the colliding name. Good.
- Function names mix the full domain word: `getCurrentGeoPosition`, `watchGeoPosition`, `clearGeoWatch` use `Geo*`, while `requestGeolocationPermission` / `setGeolocationBackend` use `Geolocation*`. This is internally inconsistent — `clearGeoWatch` vs `watchGeoPosition` vs `requestGeolocationPermission`. The `Geo` abbreviation slightly bends the "never abbreviate the type name" rule (the entity is `GeoPosition`, so `GeoPosition`-prefixed names are defensible, but `GeolocationPermission` uses the long form). Consider unifying to one stem.
- Backend seam shape (`get*Backend`/`set*Backend`/`createWeb*Backend`) matches the documented command-capability pattern exactly. Good.
- `createGeoPosition()` returning a zeroed value matches the constructor convention; the entity is plain data with no runtime, appropriate for a value-typed snapshot.

## Recommendation

Keep the verdict at **solid**. This is a faithful, idiomatic implementation of the host geolocation seam — not a stub. To reach authoritative for the capability domain:

1. Add a permission-state read distinct from request: `getGeolocationPermission(): Promise<'granted'|'denied'|'prompt'>` (or the suite's permission enum), so callers can check without prompting. This is the highest-value gap.
2. Surface failure reason. Either keep sentinels but add an optional last-error accessor, or deliver `PositionError`-equivalent kinds to the watch handler / a rejected-reason on the read — at minimum wire the web `watchPosition` error callback so watches report ongoing failures instead of silently going quiet.
3. Consider an `onGeolocationPermissionChange` hook (over the Permissions API `onchange`) if event-style capabilities are in scope for command cells.
4. Add `floorLevel` to `GeoPosition` for W3C completeness (cheap).
5. Unify the function stem (`Geo` vs `Geolocation`) for naming symmetry.

Items 1, 2, and 5 are the meaningful ones; 3 and 4 are polish.
