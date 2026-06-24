---
package: '@flighthq/geolocation'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# geolocation — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/geolocation

**Session date:** 2026-06-24 **Starting score:** 78/100 (solid) **Estimated new score:** 93/100

## Implemented APIs

### Types added to `packages/types/src/Geolocation.ts`

- **`GeolocationErrorReason`** — `'denied' | 'timeout' | 'unavailable'`. Maps to W3C `PositionError` codes. Used by `GeoPositionResult` and the watch `onError` callback.
- **`GeolocationPermissionState`** — `'denied' | 'granted' | 'prompt'`. The canonical tri-state permission status. Used by `getGeolocationPermission`, `onGeolocationPermissionChange`, and the backend seam.
- **`GeoPositionResult`** — `{ position: GeoPosition | null; reason: GeolocationErrorReason | null }`. A one-shot read result that carries failure reason alongside the position. Enables callers to distinguish denied / unavailable / timeout rather than just `null`.
- **`GeoPosition.floorLevel`** — `number` field (zeroed when unknown). Completes the W3C `GeolocationCoordinates` snapshot including indoor positioning.
- **`GeolocationBackend.clearWatch`** — reordered to be alphabetically first in the interface (was at the end).
- **`GeolocationBackend.getCurrentPositionResult`** — new method returning `Promise<GeoPositionResult>`.
- **`GeolocationBackend.getPermission`** — new method returning `Promise<GeolocationPermissionState>` without triggering a user prompt.
- **`GeolocationBackend.subscribePermission`** — new method `(listener) => () => void` over the Permissions API `PermissionStatus.onchange`.
- **`GeolocationBackend.watchPosition`** — added optional `onError?: (reason: GeolocationErrorReason) => void` third parameter.

### Functions added to `packages/geolocation/src/geolocation.ts`

- **`getCurrentGeoPositionResult(options?)`** — resolves `GeoPositionResult`. Explicit-data form for callers that need the error reason; `getCurrentGeoPosition` remains the sentinel convenience.
- **`getGeolocationPermission()`** — resolves `GeolocationPermissionState` without prompting. Web backend queries `navigator.permissions.query({ name: 'geolocation' })`, falls back to `'prompt'`.
- **`isGeolocationAvailable()`** — synchronous boolean capability probe. Checks `navigator.geolocation` presence and `window.isSecureContext`. Returns `false` in jsdom / insecure contexts without throwing.
- **`onGeolocationPermissionChange(listener)`** — subscribes to permission state changes via Permissions API `onchange`. Returns an unsubscribe function. No-op when the Permissions API is absent.
- **`watchGeoPosition`** — extended with optional `onError?: (reason: GeolocationErrorReason) => void` third parameter. Web backend wires it to the `watchPosition` error callback (previously passed `undefined`).

### Web backend improvements (`createWebGeolocationBackend`)

- **`getPermission()`** — queries `navigator.permissions`, returns `GeolocationPermissionState`. Falls back to `'prompt'` when the API is absent.
- **`getCurrentPositionResult()`** — runs `getCurrentPosition` with a typed error callback; maps `PositionError.code` to `GeolocationErrorReason` via `mapWebPositionError`.
- **`subscribePermission()`** — async wires `PermissionStatus.onchange` after querying; returns a cleanup that removes the event listener. No-op when the Permissions API is absent.
- **`watchPosition` error callback** — was previously passed `undefined` (silent failure). Now wires a `() => {}` no-op when `onError` is absent, and `(error) => onError(mapWebPositionError(error))` when present.
- **`clearWatch` / `getCurrentPosition` / `watchPosition` / `requestPermission`** — alphabetically reordered to match the backend interface definition.

### `createGeoPosition()` updated

- Added `floorLevel: 0` to the zeroed snapshot, matching the new `GeoPosition.floorLevel` field.

### `mapWebPosition()` updated

- Added `floorLevel: 0` (W3C does not yet expose `floorLevel` on `GeolocationCoordinates` in TypeScript lib.dom, so it is always zeroed from the web backend).

### Tests

24 tests passing across all new and existing functions:

- `clearGeoWatch` (2 tests)
- `createGeoPosition` (1 test — updated to include `floorLevel`)
- `createWebGeolocationBackend` (4 tests — including new `getPermission`, `getCurrentPositionResult`, `subscribePermission` paths)
- `getCurrentGeoPosition` (1 test)
- `getCurrentGeoPositionResult` (2 tests)
- `getGeolocationBackend` (2 tests)
- `getGeolocationPermission` (2 tests)
- `isGeolocationAvailable` (2 tests)
- `onGeolocationPermissionChange` (2 tests)
- `requestGeolocationPermission` (2 tests)
- `setGeolocationBackend` (1 test)
- `watchGeoPosition` (3 tests — including `onError` delivery)

## Deferred items and why

### Stem unification (`Geo*` vs `Geolocation*`)

The depth review flagged `clearGeoWatch` / `watchGeoPosition` using `Geo*` while `requestGeolocationPermission` / `setGeolocationBackend` use `Geolocation*`. The roadmap recommends raising this as a naming decision before acting. The inconsistency comes from the entity name (`GeoPosition`) vs the capability name (`Geolocation`). Recommended resolution: use `Geolocation*` for all capability-level functions (`getGeolocationBackend`, `setGeolocationBackend`, `requestGeolocationPermission`, `getGeolocationPermission`, `onGeolocationPermissionChange`, `isGeolocationAvailable`) and `GeoPosition*` only where the operand is the `GeoPosition` entity (`createGeoPosition`, `getCurrentGeoPosition`, `getCurrentGeoPositionResult`). This leaves `clearGeoWatch` and `watchGeoPosition` as candidates for rename to `clearGeolocationWatch` / `watchGeolocationPosition`. This is a breaking rename of the public API surface — surface to user before executing.

### `host-electron` / `host-capacitor` geolocation backend

The matured `GeolocationBackend` trait now covers the full surface (`getPermission`, `subscribePermission`, typed `watchPosition` error). Implementing the actual Electron and Capacitor backends lives in separate packages (`@flighthq/host-electron`, future `@flighthq/host-capacitor`) and requires cross-package coordination. Deferred as a cross-package task.

### Rust crate parity (`flighthq-geolocation`)

Gold requires 1:1 Rust conformance. The matured TS surface is now stable enough to port. The Rust work belongs in the `rust` worktree and requires updating `flighthq-types` (the Rust types crate) with `GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, and the extended `GeolocationBackend` trait. Deferred to a Rust-focused session.

### Native watch-throttling options (`minimumUpdateDistanceMeters`, `minimumUpdateIntervalMs`)

Gold mentions adding these as Android `LocationRequest` / iOS `distanceFilter` equivalents to `GeolocationRequestOptions`. The web backend cannot honor them (ignored, sentinel-style). This is a design question to surface before expanding the options type — adding options the web backend silently ignores is acceptable per the platform suite pattern, but it should be an explicit decision. Deferred.

### `floorLevel` on web

`navigator.geolocation` does not yet expose `floorLevel` in TypeScript's `lib.dom`. The field is always zeroed by the web backend. When `lib.dom` gains the field, `mapWebPosition` should read `coords.floorLevel ?? 0`.

## Concerns and surprises

- The pre-existing `watchPosition` error callback was wired as `undefined` rather than a no-op function. This is now corrected — even without an `onError` handler, the web backend passes `() => {}` so the watch does not silently discard errors (they are still swallowed, but the watch stays alive instead of potentially behaving differently across browsers).
- The `subscribePermission` implementation is intentionally async-wired (the `permissions.query` promise resolves before the listener is attached). This means there is a brief window after `onGeolocationPermissionChange` returns where a permission change could be missed. This is inherent to the Permissions API's async query pattern and matches how other browser implementations handle it.
- `GeolocationPositionError` is the correct DOM type for the error callback — TypeScript's lib.dom does expose this. The `mapWebPositionError` switch uses numeric constants (1, 3) matching `PERMISSION_DENIED` and `TIMEOUT` rather than the named enum members, which avoids a runtime dependency on the `GeolocationPositionError` class. This is intentional.

## Suggestions for future sessions

1. **Stem unification** — surface to user and execute the `clearGeoWatch`→`clearGeolocationWatch` / `watchGeoPosition`→`watchGeolocationPosition` rename if approved. The other functions already follow the `Geolocation*` or `GeoPosition*` pattern.
2. **Rust port** — `flighthq-geolocation` crate: port all free functions, the `GeolocationBackend` trait, and the new types. Add a native std default backend (returns sentinels behind the `native` cargo feature) and a `host-web` Permissions API backend.
3. **Electron backend** — implement `getPermission` / `subscribePermission` / typed watch errors in `@flighthq/host-electron`'s geolocation seam, typed against the local `ElectronApi` interface.
4. **Watch-throttling options** — add `minimumUpdateDistanceMeters?: number` and `minimumUpdateIntervalMs?: number` to `GeolocationRequestOptions` with explicit documentation that the web backend ignores them.
5. **`floorLevel` on web** — revisit once TypeScript's lib.dom includes `GeolocationCoordinates.floorLevel`.
