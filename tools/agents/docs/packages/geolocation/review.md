---
package: '@flighthq/geolocation'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# geolocation — Review

## Verdict

`solid — 88/100`. A clean, complete-for-its-domain platform-suite command cell: every W3C geolocation capability (one-shot read, watch, permission query/request/change, availability probe) is reachable through flat free functions over a swappable `GeolocationBackend`, with a guarded web default that returns sentinels rather than throwing. The `builder-67dc46d64` pass took it from a read+watch+request skeleton to full permission lifecycle and typed error reasons. The score is held below `authoritative` by one real public-API naming inconsistency (the `Geo*`/`Geolocation*` stem split), the absence of the Rust crate, and a thin charter that has not yet ratified the seam's design choices.

## Present capabilities

Grounded in `incoming/builder-67dc46d64/head/packages/geolocation/src/geolocation.ts` and `packages/types/src/Geolocation.ts`.

Command surface (all delegate to `getGeolocationBackend()`):

- **`getCurrentGeoPosition(options?)`** → `Promise<GeoPosition | null>` — the sentinel one-shot read.
- **`getCurrentGeoPositionResult(options?)`** → `Promise<GeoPositionResult>` — the explicit-data form, carrying `reason` (`'denied' | 'timeout' | 'unavailable'`) so a caller can distinguish failure modes instead of collapsing them to `null`. This is the codebase's "prefer explicit data" rule applied correctly: the sentinel form stays as the convenience, the result form is additive.
- **`watchGeoPosition(handler, options?, onError?)`** → `number` — continuous watch returning a watch id or `-1`; `clearGeoWatch(id)` cancels. `onError` was wired this pass (previously `undefined`).
- **`requestGeolocationPermission()`** / **`getGeolocationPermission()`** / **`onGeolocationPermissionChange(listener)`** — the full tri-state (`'granted' | 'denied' | 'prompt'`) permission lifecycle: prompt, non-prompting query, and live change subscription with an unsubscribe return.
- **`isGeolocationAvailable()`** → `boolean` — synchronous capability probe (checks `navigator`, `window.isSecureContext`, `navigator.geolocation`); false in jsdom/insecure contexts without throwing.
- **`createGeoPosition()`** — zeroed scratch allocator, now including `floorLevel: 0`.
- Seam plumbing: **`getGeolocationBackend()`** (lazy web default), **`setGeolocationBackend(backend|null)`** (null restores the default), **`createWebGeolocationBackend()`** — the standard command-capability triad matching the platform-suite pattern.

Web backend quality is good: every entry guards `navigator`/`navigator.geolocation`/`navigator.permissions` presence and wraps the synchronous DOM calls in `try/catch`, resolving sentinels on failure. `mapWebPositionError` maps `PositionError.code` (1→`denied`, 3→`timeout`, else→`unavailable`) using numeric constants to avoid a runtime dependency on the `GeolocationPositionError` class. The `type GlobalGeolocationPosition = GeolocationPosition` alias keeps source from referencing the colliding lib.dom global directly — a thoughtful touch.

Tests: 24 across 12 `describe` blocks, alphabetized and mirroring the exported names; a `fakeBackend()` fixture exercises delegation and the web backend is exercised in jsdom (the sentinel paths). The `watchGeoPosition` `onError` delivery and `getCurrentGeoPositionResult` success/failure split are both covered. `sideEffects: false`, single root `.` export, `@flighthq/types`-only dependency — all contract-conformant.

Every status-doc claim was verified against `changes.patch` (the geolocation src delta at patch line 89571 and the types delta at 342820): the new types, the `floorLevel` field, the alphabetized backend interface, the `onError` wiring, and the four new backend methods are all present as claimed.

## Gaps

What a mature acquire-location seam would also carry, named concretely (sequencing is the assessor's job):

- **Stem inconsistency (the one real public-API blemish).** `clearGeoWatch` and `watchGeoPosition` use the `Geo*` stem; every other function uses `Geolocation*` (or `GeoPosition*` for the entity). No sibling platform cell has a split stem — `haptics`, `clipboard`, `notification`, and `webcam` each use the full capability word for every function. This breaks the "globally self-identifying name" design constraint: `watchGeoPosition` does not lead unambiguously back to the geolocation domain the way `watchGeolocationPosition` would. The status doc correctly flags this as a breaking rename to surface before acting.
- **`isGeolocationAvailable` vs the sibling `is*Supported` convention.** `haptics` exposes `isHapticsSupported`, `notification` exposes `isNotificationSupported`. `isGeolocationAvailable` is a third spelling for the same capability-probe concept. Either is defensible, but the suite is not yet consistent — and there is no `getGeolocationCapabilities` companion the way `haptics`/`notification` pair their probe with a capability descriptor.
- **No `host-electron` / native backend.** The trait is now full-surface, but only the web backend exists. Cross-package; correctly deferred by the worker.
- **No Rust crate (`flighthq-geolocation`).** The charter declares `crate: flighthq-geolocation`, so the crate is expected to exist; it does not yet. 1:1 conformance is unmet until the free functions, the `GeolocationBackend` trait, and the four new types (`GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, `GeoPosition.floorLevel`) land in the Rust port with a native-default + `host-web` backend.
- **Native watch-throttling options absent.** `GeolocationRequestOptions` has no `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` (Android `LocationRequest` distance/interval, iOS `distanceFilter`). The web backend cannot honor them, so this is a design question, not a sweep — but a mature native watch API exposes them.
- **`floorLevel` is structurally present but always zero from the web** (lib.dom does not yet type `GeolocationCoordinates.floorLevel`). The field is honest (zeroed-when-unknown matches the other coords), but the web path will silently never populate it until lib.dom catches up. A `coords.floorLevel ?? 0` read is a one-line follow-up gated on the lib type.
- **`subscribePermission` has a documented attach-race.** The listener is wired only after the `permissions.query()` promise resolves, so a permission change in that window is missed. Inherent to the Permissions API and matched by other implementations, but worth noting as a known limitation, not a bug.

## Charter contradictions

None. The charter's only substantive prose is the **What it is** line — "acquiring location from the host, not geospatial computation (distance, bearing, geofencing math live outside this seam)." The package honors that boundary exactly: it contains zero geospatial math, only acquisition and permission. North star, Boundaries, Decisions, and Open directions are all still `TODO`/empty, so there is little else to contradict (see candidate open directions below).

## Contract & docs fit

**Lives up to the contract:** types-first (all shapes in `@flighthq/types/src/Geolocation.ts`, package imports them, defines none locally); full unabbreviated names (modulo the `Geo*` stem split above); sentinels-not-throws throughout the web backend (`null`, `false`, `-1`, `'prompt'`, no-op unsubscribe); single root `.` export; `sideEffects: false`; the command-capability triad (`get*Backend`/`set*Backend`/`createWeb*Backend`) matching the platform-suite shape described in the codebase map. `out`-params are not applicable here (async acquisition, not hot-loop math). Alphabetized exports and source-aligned tests both hold.

**Candidate doc revisions (user's gate, not mine):**

- The **Package Map** line for `@flighthq/geolocation` reads "current position and position watches" — it now understates the package, which also owns the full permission lifecycle (query/request/change) and an availability probe. Worth widening to "current position, position watches, and permission state" so the map reflects the shipped surface.
- The map's platform-suite preamble lists the standard command-capability sentinels but does not mention the **`*Result` explicit-data companion** pattern (`getCurrentGeoPositionResult` alongside the sentinel `getCurrentGeoPosition`). If this becomes the suite-wide convention for "sentinel form plus reason-carrying form," it deserves a line in the suite description so other cells mirror it.

## Candidate open directions

These are questions the charter is silent on that a reviewer had to assume — they feed the charter's empty **Open directions** / **Decisions** for the user to settle:

1. **Stem unification — ratify `Geolocation*` and approve the breaking rename.** Should `clearGeoWatch`→`clearGeolocationWatch` and `watchGeoPosition`→`watchGeolocationPosition`, leaving `GeoPosition*` only for the entity (`createGeoPosition`, `getCurrentGeoPosition`, `getCurrentGeoPositionResult`)? This is a public-API fork, not a sweep — it needs a Decision.
2. **Probe-verb convention across the platform suite.** Settle `is*Available` vs `is*Supported` (and whether a `getGeolocationCapabilities` companion is wanted) so the whole suite speaks one word for the capability probe. Cross-package; a structural-forks-style ruling.
3. **Native throttling options.** Adopt `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` (web ignores them, sentinel-style, per the platform pattern) — yes/no is an explicit decision because it adds options one backend silently drops.
4. **Rust crate priority.** The charter asserts `crate: flighthq-geolocation`; confirm the port is in scope now that the TS surface has stabilized, and whether the native default returns sentinels behind the `native` cargo feature.
5. **`GeoPositionResult` as a suite pattern.** Decide whether the "sentinel form + reason-carrying `*Result` form" pairing is a geolocation-local choice or a platform-suite convention worth propagating (and documenting in the map).
