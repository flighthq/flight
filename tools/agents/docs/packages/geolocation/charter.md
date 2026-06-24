---
package: '@flighthq/geolocation'
crate: flighthq-geolocation
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# geolocation — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Device geolocation — reading the device's current geographic position, watching position over time, and managing the location-permission lifecycle (query, request, live change). As a Flight Platform Integration Suite cell, it is a **command-style capability**: flat free functions over a swappable `GeolocationBackend`, with a lazily-available web default (over `navigator.geolocation` / `navigator.permissions`) that a native host replaces via `setGeolocationBackend`.

The domain ends at _acquiring_ location from the host. Geospatial computation — distance, bearing, geofencing math, coordinate-system projection — lives outside this seam (it is value math, not host acquisition). The neighbor on the host side is the rest of the platform suite (`@flighthq/sensors` for raw motion, `@flighthq/device` for static identity); geolocation owns only the live position-and-permission surface.

## North star (proposed)

- **Acquisition, not computation.** This cell reads location and manages its permission; it never does geospatial math. Anything that operates _on_ coordinates after they are read belongs in a value/math package, not here.
- **Sentinels over throws, everywhere.** Location access is an expected-failure surface, not a programmer error. The web backend guards `navigator`/`permissions`/secure-context presence and resolves `null` / `false` / `-1` / `'prompt'` / no-op rather than throwing — and the seam preserves that for every backend.
- **Explicit data is additive, not a replacement.** The sentinel form (`getCurrentGeoPosition` → `… | null`) stays the convenience; the reason-carrying form (`getCurrentGeoPositionResult` → `GeoPositionResult`) is the explicit-data companion for callers that must distinguish `denied` / `timeout` / `unavailable`. Neither shadows the other.
- **One swappable backend, web by default.** The standard platform-suite triad — `getGeolocationBackend` / `setGeolocationBackend` / `createWebGeolocationBackend` — is the only seam. "Native support" is a backend, never a coupling baked into the functions.
- **Types-first, single root export, side-effect-free.** All shapes live in `@flighthq/types`; the package imports them and defines none locally; one `.` entry; `sideEffects: false`; no registration or listeners at module top level.

## Boundaries (proposed)

In scope:

- One-shot position read (sentinel + `*Result` reason-carrying form).
- Continuous position watch (`watch*` / `clear*Watch`) with an `onError` channel.
- The full permission lifecycle: non-prompting query, request, and live change subscription.
- A synchronous capability probe.
- The web backend and the `GeolocationBackend` seam for native hosts.

Non-goals:

- Geospatial math — distance, bearing, geofencing, coordinate projection.
- Mapping, tiles, reverse-geocoding, or any network-backed location service.
- Raw motion/orientation sensors (`@flighthq/sensors`) and static device identity (`@flighthq/device`).
- Shipping the native host backend from this package — host adapters live in `host-*` crates/packages.

## Decisions

None blessed yet.

## Open directions

Every question below is unsettled and needs your ruling before it becomes a Decision. Several are platform-suite-wide forks that touch sibling cells, not geolocation-local choices.

1. **Stem unification (public-API fork, breaking rename).** Every function uses the `Geolocation*` stem except `watchGeoPosition` and `clearGeoWatch`, which use `Geo*`. No sibling cell (`haptics`, `clipboard`, `notification`, `webcam`) has a split stem. Should these become `watchGeolocationPosition` / `clearGeolocationWatch`, leaving `GeoPosition*` only for the entity functions (`createGeoPosition`, `getCurrentGeoPosition`, `getCurrentGeoPositionResult`)? This is a Decision, not a sweep — it breaks the public surface.

2. **Probe-verb convention across the suite (cross-package fork).** `isGeolocationAvailable` is a third spelling for the capability probe (`haptics` → `isHapticsSupported`, `notification` → `isNotificationSupported`). Settle `is*Available` vs `is*Supported` suite-wide — and whether a `getGeolocationCapabilities` companion descriptor is wanted (the way `haptics`/`notification` pair their probe with a capability descriptor). This belongs in `structural-forks.md`, ruled once for the whole suite.

3. **`GeoPositionResult` as a suite pattern.** Is the "sentinel form + reason-carrying `*Result` form" pairing a geolocation-local choice, or a platform-suite convention worth propagating to other cells and documenting in the Package Map's suite preamble?

4. **Native watch-throttling options (design fork — adds options one backend drops).** Should `GeolocationRequestOptions` gain `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` (Android `LocationRequest` distance/interval, iOS `distanceFilter`)? The web backend cannot honor them and would ignore them sentinel-style — explicit yes/no needed because it surfaces options one backend silently drops.

5. **Rust crate priority (conformance).** The front matter asserts `crate: flighthq-geolocation`, but no crate exists yet. Confirm the port is in scope now that the TS surface has stabilized, and whether the native default returns sentinels behind the `native` cargo feature with a `host-web` fill — i.e. the standard platform-suite seam mapped to Rust.

6. **`floorLevel` web population.** The field is structurally present and honestly zeroed-when-unknown, but lib.dom does not yet type `GeolocationCoordinates.floorLevel`, so the web path never populates it. Is a `coords.floorLevel ?? 0` read (gated on the lib type) a follow-up to track, or left until lib.dom catches up?

7. **`host-electron` / native backend home.** Only the web backend exists. Where does the desktop backend land (a `host-electron`-style adapter), and is it in scope for this pass? Cross-package.

8. **`subscribePermission` attach-race.** The listener is wired only after `permissions.query()` resolves, so a change in that window is missed. Is this acceptable as a documented Permissions-API limitation, or should it be designed around?

9. **Package Map widening.** The map line reads "current position and position watches"; the cell now also owns the full permission lifecycle and an availability probe. Approve widening it (e.g. "current position, position watches, and permission state") — a doc change, your gate.
