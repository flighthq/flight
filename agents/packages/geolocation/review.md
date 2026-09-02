---
package: '@flighthq/geolocation'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source (packages/geolocation/src)
  - packages/types/src/Geolocation.ts
  - packages/host-web/src/webGeolocation.ts
  - packages/host-capacitor/src/capacitorGeolocation.ts
---

# geolocation — Review

> Re-survey of the live tree (2026-09-02). Supersedes the 2026-07-13 review (solid, 82). The package has undergone a significant structural change since then: the permission lifecycle was removed and replaced by a single capability-native prompt mechanism. The score moves from 82 to 80 — the permission split is an architectural improvement, but the resulting dependency-model asymmetry between position functions and the prompt function is new and unchartered, and the diagnostics layer remains absent.

## Verdict

`solid — 80/100`. A small, well-bounded domain covered cleanly: one-shot position (both `null`-sentinel and reason-carrying `GeoPositionResult`), position watch with ongoing error channel, accuracy/timeout/max-age options, heading/speed/altitude/floor-level fields, a synchronous availability probe, a zeroed-scratch constructor, and a capability-native prompt mechanism that returns a seven-arm `GeolocationAccessOutcome` without leaking permission vocabulary. The three-tier backend resolution (custom > host > sentinel) is a clear upgrade over the old single-slot model, and `explainGeolocationBackend()` provides the explain diagnostic the previous review noted absent. 33 colocated tests across 2 test files pass. Held below 85 by the missing guard layer, the open watch-throttling decision, and the dual dependency model (module state for position reads, `Host` parameter for prompt).

## Present capabilities

### Position acquisition (`geolocation.ts`, 264 lines)

- **One-shot**: `getCurrentGeoPosition(options?) -> GeoPosition | null` — null sentinel on failure. `getCurrentGeoPositionResult(options?) -> GeoPositionResult` — reason-carrying companion distinguishing `'denied' | 'timeout' | 'unavailable'`.
- **Watch**: `watchGeolocationPosition(handler, options?, onError?) -> number` — returns `-1` sentinel when unavailable. `clearGeolocationWatch(id)` — forwards to backend.
- **Scratch constructor**: `createGeoPosition()` — zeroed `GeoPosition` with all nine fields.
- **Options**: `GeolocationRequestOptions` with `enableHighAccuracy`, `timeoutMs`, `maximumAgeMs` — unit-suffixed names. Mapped to `PositionOptions` at the web seam via `toPositionOptions`.

### Backend resolution (`geolocation.ts`)

Three-tier module state: `_custom` (via `setGeolocationBackend`) > `_host` (via `installGeolocationHostBackend`) > `_sentinel`.

- `getGeolocationBackend()` — returns the winning backend.
- `setGeolocationBackend(backend | null)` — custom override, `null` clears.
- `installGeolocationHostBackend(backend)` — first-host-wins; a second different backend sets `_hostConflict = true` but does not replace.
- `resetGeolocationBackendForTest()` — clears all slots.

### Explain diagnostics (`geolocation.ts`)

- `explainGeolocationBackend() -> BackendExplanation` — reports `layer` (`'custom' | 'host' | 'host-not-enabled'`), `conflict` (boolean), `operation` (string or null), and `viability` (`'unobserved' | 'available' | 'runtime-api-unavailable'`).
- `observeGeolocationHostResult(operation, succeeded)` — records a viability observation; called by host backends (host-web wraps every operation with it).

### Prompt mechanism (`geolocationAccess.ts`, 25 lines)

- `promptForGeolocationAccess(host: Host) -> GeolocationAccessOutcome` — takes a `Host` explicitly, reads `host.system?.geolocation.promptForAccess()`. Returns `{ reason: 'runtime-unavailable' }` when no provider is installed; catches and maps throws to `{ reason: 'operation-failed' }`.
- `GeolocationAccessOutcome` (in `types/src/Geolocation.ts`) carries seven arms: `'granted' | 'denied' | 'dismissed' | 'timeout' | 'cleanup-failed' | 'runtime-unavailable' | 'operation-failed'`. Deliberately not a `PermissionState` — no `state` field, no permission vocabulary.

### Web backend (`geolocation.ts::createWebGeolocationBackend`)

Implements all six `GeolocationBackend` members with try/catch around every `navigator.geolocation` call. Degrades to sentinels when the API is absent (jsdom, insecure context). `isAvailable()` checks both `navigator.geolocation` existence and `window.isSecureContext`. `promptForAccess()` performs a position probe (the web has no dedicated permission-request API) and maps error codes: code 1 to `'denied'`, code 3 to `'timeout'`, others to `'operation-failed'`. `mapWebPosition` reads `floorLevel` via `(coords as { floorLevel?: number }).floorLevel ?? 0` — the 2026-07-02 charter Decision is still implemented.

### Host backends (outside this package)

- **Web** (`host-web/src/webGeolocation.ts`): `enableHostWebGeolocation()` wraps `createWebGeolocationBackend` with `observeGeolocationHostResult` calls on every operation, then calls `installGeolocationHostBackend`. First-call-wins guard via `_enabled`.
- **Capacitor** (`host-capacitor/src/capacitorGeolocation.ts`): `createCapacitorGeolocationBackend(capacitor)` adapts the async Capacitor watch-id model (string) to the synchronous numeric-id contract via a `Map<number, string | null>`. `promptForAccess` uses the real Capacitor `requestPermissions()` API. Maps `'prompt'` back from the plugin to `'dismissed'`. Note: `floorLevel` is hardcoded to `0` (Capacitor's position type does not carry it), and `getCurrentPositionResult` collapses every failure to `reason: 'unavailable'` (the denied/timeout distinction the type exists for is unavailable).

### Probes

- `isGeolocationAvailable()` — delegates to `getGeolocationBackend().isAvailable()`.

### Tests

- `geolocation.test.ts`: 28 tests across 12 `describe` blocks — `clearGeolocationWatch`, `createGeoPosition`, `createWebGeolocationBackend` (4 tests including `floorLevel` read-through and secure-context check), `explainGeolocationBackend` (4 tests), `getCurrentGeoPosition`, `getCurrentGeoPositionResult` (2 tests), `getGeolocationBackend` (2 tests), `installGeolocationHostBackend` (2 tests), `isGeolocationAvailable` (3 tests), `observeGeolocationHostResult` (2 tests), `resetGeolocationBackendForTest`, `setGeolocationBackend`, `watchGeolocationPosition` (3 tests).
- `geolocationAccess.test.ts`: 5 tests — granted, three-way denied/dismissed/timeout distinction, runtime-unavailable when no provider, operation-failed on throw, and a structural assertion that no `state` field appears on any arm.

### Hygiene

- `sideEffects: false`, two blessed export lanes (`.` and `./contract`), no dependencies beyond `@flighthq/types`.
- Public lane (`index.ts`) exports 8 functions: `clearGeolocationWatch`, `createGeoPosition`, `explainGeolocationBackend`, `getCurrentGeoPosition`, `getCurrentGeoPositionResult`, `isGeolocationAvailable`, `promptForGeolocationAccess`, `watchGeolocationPosition`.
- Contract lane (`contract.ts`) adds 6 more: `createWebGeolocationBackend`, `getGeolocationBackend`, `installGeolocationHostBackend`, `observeGeolocationHostResult`, `resetGeolocationBackendForTest`, `setGeolocationBackend`.
- Module state at file bottom. Lib.dom name collision handled via `GlobalGeolocationPosition` alias.

## Gaps

1. **Native watch-throttling options absent** (charter Open direction #2): `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` on `GeolocationRequestOptions` — the fields native hosts (Core Location `distanceFilter`, Android `LocationRequest` distance/interval floor) expect. Additive type change; requires the chartered decision on how the web backend documents ignoring them.
2. **No guard layer**: silent sentinels (`null`, `-1`, `{ reason: 'unavailable' }`) with no `enableGeolocationGuards` / shakeable guard module. `explainGeolocationBackend()` is the explain half; the guard half (runtime warnings on misuse) does not exist. Suite-wide condition.
3. **Capacitor backend loses error-reason fidelity**: `getCurrentPositionResult` collapses every error to `reason: 'unavailable'` — the `'denied' | 'timeout'` distinction that `GeoPositionResult.reason` exists for is unavailable on the one shipping native host. `promptForAccess` is the strong half (maps Capacitor's `'granted' | 'denied' | 'prompt'`).
4. **Capacitor backend hardcodes `floorLevel: 0`**: the web backend reads the non-standard field; the Capacitor adapter does not, because Capacitor's position type lacks it. Minor — the field will stay zero unless the Capacitor plugin surfaces it.
5. **Rust mirror `flighthq-geolocation` unstarted.** Per suite-wide posture, TS is the spec.

## Charter contradictions

None found. Both 2026-07-02 Decisions are still implemented:

- **Full `Geolocation*` prefix**: verified — all exports use `Geolocation*` or `GeoPosition*` (the `Geo` in `GeoPosition` / `GeoPositionResult` is a collision-avoidance abbreviation for the type name, not a function-name abbreviation; the charter Decision targets function names). No `clearGeoWatch` or `watchGeoPosition` survives anywhere in `packages/`.
- **`floorLevel` reads actual value**: `mapWebPosition` reads `(coords as { floorLevel?: number }).floorLevel ?? 0` at line 223.

The domain boundary holds: acquisition only, no geospatial math has crept in.

## Contract & docs fit

**Package against contract:**

- **Types-first satisfied**: `GeoPosition`, `GeoPositionResult`, `GeolocationErrorReason`, `GeolocationRequestOptions`, `GeolocationAccessOutcome`, and `GeolocationBackend` all live in `packages/types/src/Geolocation.ts`. The old `GeolocationPermissionState` type has been correctly removed alongside its three consuming functions.
- **Sentinels, never throws**: the sentinel backend returns `null`, `-1`, and `{ reason: 'unavailable' }` / `{ reason: 'runtime-unavailable' }` consistently. `promptForGeolocationAccess` catches backend throws and returns `{ reason: 'operation-failed' }`.
- **`Readonly<>` on parameters**: `options` takes `Readonly<GeolocationRequestOptions>`, `handler` receives `Readonly<GeoPosition>`, `Host` parameter is `Readonly<Host>`.
- **`sideEffects: false`**: declared and honored — no registration at import.
- **Two blessed export lanes**: `.` (8 public functions) and `./contract` (14 total). No other subpaths.
- **Full unabbreviated function names**: `clearGeolocationWatch`, `watchGeolocationPosition`, `getCurrentGeoPosition`, `promptForGeolocationAccess` — all carry the full `Geolocation` stem in the verb portion.

**Dependency model tension**: the position-reading functions (`getCurrentGeoPosition`, `watchGeolocationPosition`, `clearGeolocationWatch`, `isGeolocationAvailable`) use module-scoped mutable state (`_custom`, `_host`, `_sentinel`) via `getGeolocationBackend()` — the platform-suite pattern sanctioned by both the charter and `platform-integration.md`. The prompt function (`promptForGeolocationAccess`) takes a `Host` parameter explicitly — the explicit dependency model the codebase map prefers. Both patterns exist in the same package, serving different operations, without a chartered decision on which is canonical or whether the asymmetry is intentional. The `Host.system.geolocation` field carries the same `GeolocationBackend` interface, but the prompt function reads it from `Host` rather than from `getGeolocationBackend()`, so a `setGeolocationBackend` override does not affect prompting. This is architecturally reasonable (the prompt is a one-shot capability action, not a hot-path position read), but the divergence is unchartered.

**Contract/admin doc candidate revisions:**

- The Package Map line in `AGENTS.md` lists geolocation under "Platform" with no description. The June/July reviews noted the line undersells the package; the permission lifecycle removal and prompt-mechanism addition change the description further. The Package Map is a one-word list, not a description surface — no revision needed.
- The platform-integration shared principles (`platform-integration.md`) describe the `get*Backend / set*Backend` command-capability pattern. The geolocation package now uses a three-tier model (`_custom / _host / _sentinel`) with separate install verbs, which is a refinement of the pattern the suite doc describes but is not reflected there. This is a minor drift — the suite doc could acknowledge the install/set split.

## Candidate open directions

1. **Dependency-model asymmetry**: the position functions use module state (`getGeolocationBackend()`), while `promptForGeolocationAccess` takes `Host`. Is this the intended long-term shape — module state for frequent calls, `Host` for capability actions — or a transitional state toward fully explicit Host-based access? A ruling would settle whether other platform packages should follow the same split.
2. **Watch-throttling seam fields** (charter Open direction #2): `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` on `GeolocationRequestOptions` — decide and land the type before a second native host commits to the narrower contract.
3. **`GeoPositionResult` as a suite-wide pattern** (charter Open direction #1): `storage`, `net`, and `webcam` share the "why did it fail" need. Still open.
