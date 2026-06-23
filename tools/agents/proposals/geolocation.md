---
id: geolocation
title: '@flighthq/geolocation'
type: depth
target: geolocation
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/geolocation.md
  - tools/agents/docs/reviews/depth/geolocation.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — completeness 78/100; a faithful, idiomatic host-geolocation seam (one-shot read, watch, permission request, swappable backend), losing points only on the permission _state_ surface, failure-reason expressiveness, silent watch errors, and a couple of W3C fields.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely-useful upgrade — close the gaps that materially limit UX (retry vs. open-settings, watch reliability) without changing the capability's command-style classification.

- **`getGeolocationPermission(): Promise<GeolocationPermissionState>`** — a permission _state_ read distinct from request, returning the canonical tri-state without triggering a prompt. Highest-value gap. Define the state type in `@flighthq/types` first (see Sequencing for the cross-package decision: a shared `PermissionState = 'granted' | 'denied' | 'prompt'` vs. a local `GeolocationPermissionState`). Web backend over `navigator.permissions.query({ name: 'geolocation' })`, falling back to `'prompt'` when the Permissions API is absent.
- **Add `getPermission()` to `GeolocationBackend`** — the backend method behind the above; native hosts implement it. Web default maps `PermissionStatus.state` 1:1.
- **Wire the web `watchPosition` error callback** — currently passed `undefined`, so a watch that loses its fix or has permission revoked silently goes quiet. Deliver ongoing errors to the handler (see Silver for the typed handler shape; Bronze can at minimum re-emit a sentinel/last-error so the watch is not silent).
- **Add `floorLevel: number` to `GeoPosition`** — W3C `GeolocationCoordinates.floorLevel` (indoor positioning), zeroed when unknown. Update `createGeoPosition()` and `mapWebPosition()`. Cheap, completes the snapshot.
- **Unify the function stem** — resolve the `Geo*` vs `Geolocation*` inconsistency flagged in the depth review (`clearGeoWatch`/`watchGeoPosition` vs `requestGeolocationPermission`/`setGeolocationBackend`). Pre-release, with no published consumers, rename to one stem. Recommended: `Geolocation*` everywhere the concept is the _capability_ (permission, backend) and `GeoPosition`-prefixed only where the operand is the `GeoPosition` entity — or pick one stem wholesale. This is a naming decision to surface, not an autonomous churn.

### Silver

Competitive with a well-regarded host-geolocation wrapper (Capacitor/Cordova Geolocation, the W3C surface fully expressed): typed failure reasons, watch-error delivery, permission-change subscription, and cross-backend consistency.

- **Typed failure reason on reads.** Keep the sentinel return (`null`) but add a `GeolocationErrorReason` kind so callers can distinguish denied / unavailable / timeout. Two compatible shapes: (a) an optional last-error accessor `getLastGeolocationError(): GeolocationErrorReason | null`, or (b) a richer one-shot variant `getCurrentGeoPositionResult(options?): Promise<GeoPositionResult>` where `GeoPositionResult` is `{ position: GeoPosition | null; reason: GeolocationErrorReason | null }`. Prefer (b) as the explicit-data form; keep `getCurrentGeoPosition` as the sentinel convenience. Define `GeolocationErrorReason = 'denied' | 'unavailable' | 'timeout'` in `@flighthq/types`.
- **Watch error delivery (typed).** Extend `watchPosition` in the backend and `watchGeoPosition` to accept an optional `onError?: (reason: GeolocationErrorReason) => void`, mapping the W3C `PositionError` codes (`PERMISSION_DENIED`/`POSITION_UNAVAILABLE`/`TIMEOUT`). Native hosts forward their own error stream through the same callback.
- **`onGeolocationPermissionChange(listener: (state: GeolocationPermissionState) => void): () => void`** — a permission-change subscription over the Permissions API `PermissionStatus.onchange`, returning an unsubscribe function (the `on*(listener): () => void` shape the suite uses for command capabilities that also receive events, e.g. `onScreenChange`, power `onSuspend`). Add `subscribePermission(listener): () => void` to `GeolocationBackend`. This makes the seam react to OS settings changes mid-session.
- **`isGeolocationAvailable(): boolean`** — synchronous capability probe (web: secure context + `navigator.geolocation` present), so callers can branch UI without an async round-trip. Returns `false` rather than throwing on insecure context / jsdom.
- **Backend-completeness guards parity.** Ensure every new backend method has a web-default implementation that returns suite sentinels (`'prompt'`, `null`, no-op unsubscribe) when the underlying API is missing, matching the existing fully-guarded web backend. Add unit coverage for the absent-API path of each new method.
- **Colocated tests for every new export** (`getGeolocationPermission`, `getCurrentGeoPositionResult`, `onGeolocationPermissionChange`, `isGeolocationAvailable`, watch `onError`), alphabetized `describe` blocks mirroring source order, including the insecure-context/jsdom sentinel paths and the Permissions-API-absent fallback.

### Gold

Authoritative for the host-geolocation capability domain — nothing a domain expert finds missing in the seam, full cross-backend and Rust-port fidelity, and the host-adapter coverage that proves the seam is not web-shaped.

- **Full W3C/native option fidelity.** Confirm `GeolocationRequestOptions` covers every option a mature host exposes and document the unit suffix convention (`timeoutMs`/`maximumAgeMs`) as canonical; add `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` to the watch options if native plugins (Android `LocationRequest`, iOS `distanceFilter`) warrant it — these are watch-throttling knobs the web API lacks but native hosts honor. Surface as a design question (web backend ignores them, sentinel-style).
- **`flighthq-host-electron` (and future `host-capacitor`) geolocation backend.** Realize the native side of the seam: Electron main-process / Capacitor Geolocation plugin implementations of `getCurrentPosition`/`watchPosition`/`clearWatch`/`getPermission`/`requestPermission`/`subscribePermission`, typed against a local host API interface and unit-tested with a fake (mirroring `registerElectronBackends`). Proves the seam supports a non-web host end-to-end.
- **Rust-port 1:1 conformance — `flighthq-geolocation` crate.** The crate already exists; bring it to parity with the matured TS surface: free functions (`get_current_geo_position`, `watch_geo_position`, `clear_geo_watch`, `get_geolocation_permission`, `request_geolocation_permission`, `on_geolocation_permission_change`, `is_geolocation_available`, `get_geolocation_backend`/`set_geolocation_backend`), `GeolocationBackend` trait, `GeoPosition`/`GeolocationRequestOptions`/`GeolocationPermissionState`/`GeolocationErrorReason` in `flighthq-types`. Native default backend (gated behind the `native` cargo feature — e.g. a platform location service or a no-op std default returning sentinels), `host-web` backend over the same `navigator.geolocation`/Permissions API for the conformance instrument. Watch ids as the same numeric sentinel (`-1`). Record any intentional TS↔Rust divergence in the conformance map.
- **Exhaustive error/edge handling.** Timeout precision, rapid watch start/stop churn (no leaked native watchers), permission revoked mid-watch surfaced via `onError`, duplicate `clearGeoWatch` calls as no-ops, `getCurrentGeoPosition` while a watch is active. Each as an explicit test.
- **Documentation.** A package-level doc covering the command-capability shape, the sentinel-vs-reason contract, the permission tri-state semantics (check vs. request vs. subscribe), backend-replacement for native hosts, and the explicit out-of-domain boundary (no distance/bearing/geofence/reverse-geocode math — those belong to a separate geospatial-math package, not this seam).
- **Optional neighbor only if scope grows:** if geospatial computation is ever wanted, it is a _separate_ package (e.g. `@flighthq/geo` / `geospatial`), never folded into this host-capability cell. Note it as a future sibling, not a Gold deliverable here.

## Sequencing & effort

Recommended order, dependencies, and items to surface before acting:

1. **Cross-package design decision first (surface to user): shared `PermissionState`.** Geolocation, `notification`, `webcam`, and other suite cells all need the `'granted' | 'denied' | 'prompt'` tri-state. Today only `webcam` has a `'prompt'`-bearing type and `notification` collapses to boolean. Decide whether to introduce a single `PermissionState` in `@flighthq/types` reused suite-wide, or per-capability local types. This blocks `getGeolocationPermission`. Recommend the shared type for symmetry — but it touches multiple packages, so raise it rather than deciding unilaterally.
2. **Types-layer changes (header first):** add `floorLevel` to `GeoPosition`, the permission-state type, `GeolocationErrorReason`, and extend `GeolocationBackend` (`getPermission`, `subscribePermission`, watch `onError`). All in `@flighthq/types` before any implementation. Low effort, but ordering-critical: the header is the design surface.
3. **Bronze (small, ~half a day):** `getGeolocationPermission` + backend `getPermission`, wire the watch error callback, `floorLevel`, stem-unification rename. The rename is mechanical but a public-API reshape — run `npm run api` / `npm run order` / `npm run exports:check` after, and `npm run fix`. No dependency beyond step 1–2.
4. **Silver (~1–2 days):** typed reasons (`getCurrentGeoPositionResult`), typed watch `onError`, `onGeolocationPermissionChange` + `subscribePermission`, `isGeolocationAvailable`, full sentinel-path tests. Depends on the type additions from step 2. The permission-change subscription is the only piece that nudges this command cell toward event behavior — confirm that is acceptable for command-style cells (the suite already does this with `onScreenChange`/power `on*`, so it is precedented).
5. **Gold (multi-day, parallelizable):**
   - Rust crate parity is independent work once the TS surface is frozen — assign after Silver lands so the crate ports a stable header. Cross-references the conformance map.
   - `host-electron`/`host-capacitor` backend depends on the matured `GeolocationBackend` trait shape and is a separate package's worktree — surface as a cross-package task, do not reach into `host-electron` from this worktree autonomously.
   - Native watch-throttling options are a design question (web cannot honor them) — surface before adding to `GeolocationRequestOptions`.

**Cross-package / design items to surface explicitly:** (a) the shared `PermissionState` decision (step 1, blocks Bronze); (b) whether a permission-change subscription belongs on a command-classified cell (step 4); (c) native-only watch-throttling options (Gold); (d) `host-electron`/`host-capacitor` backend work lives outside this package's worktree. Everything else (Bronze, most of Silver, the types additions, the Rust crate body) is in-scope for the geolocation worktree.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/geolocation` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
