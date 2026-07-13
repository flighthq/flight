---
package: '@flighthq/geolocation'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - status.md
  - charter.md
  - source (packages/geolocation/src)
  - packages/types/src/Geolocation.ts
---

# geolocation — Review

> Depth review of the live tree (2026-07-13). Supersedes the 2026-06-25 merge-gate review of `integration-b2824e3d8`, whose REJECT verdict (35) scored a snapshot missing the `@flighthq/types` half of the change. **That blocker is resolved**: `packages/types/src/Geolocation.ts` now defines `GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, the `floorLevel` field, and the full 7-member `GeolocationBackend` (`getCurrentPositionResult`, `getPermission`, `subscribePermission`, `watchPosition` with `onError`). The June review's estimate — "would score ~80 reviewed in isolation" — now applies to the tree as it stands, and both 2026-07-02 charter Decisions are verified implemented.

## Verdict

`solid — 82/100`. A small domain covered completely for its rubric: one-shot position (both the `null`-sentinel form and the reason-carrying `GeoPositionResult` companion), position watch with an ongoing `onError` channel, accuracy/timeout/max-age options, heading/speed/altitude/floor-level fields, the full permission lifecycle (query without prompting, request, live change subscription), a synchronous availability probe, and a zeroed-scratch constructor. The web default guards every `navigator.geolocation` / `navigator.permissions` touch and degrades to sentinels; the seam gives native hosts everything they need for full fidelity except watch-throttling options. 25 colocated tests mirror all 12 exports. Held below 85 by the chartered open items (throttle options, the `subscribePermission` attach race) and the absent diagnostics layer — not by any missing rubric row.

## Present capabilities

Verified against `packages/geolocation/src/geolocation.ts` (250 lines) and `geolocation.test.ts` (25 tests, describes mirror all 12 exports in order):

- **Acquisition**: `getCurrentGeoPosition(options?) → GeoPosition | null`; `getCurrentGeoPositionResult(options?) → { position, reason }` distinguishing `'denied' | 'timeout' | 'unavailable'`; `createGeoPosition()` zeroed scratch value.
- **Watching**: `watchGeolocationPosition(handler, options?, onError?) → id` (`-1` sentinel), `clearGeolocationWatch(id)`. The 2026-07-02 `Geo*` → `Geolocation*` rename Decision is **implemented** — no `watchGeoPosition` / `clearGeoWatch` remains anywhere in `packages/`.
- **Permissions**: `getGeolocationPermission()` (Permissions API, `'prompt'` fallback), `requestGeolocationPermission()` (query, falling back to a position probe), `onGeolocationPermissionChange(listener) → unsubscribe` (no-op subscription without the Permissions API).
- **Probes/seam**: `isGeolocationAvailable()` synchronous (checks `navigator`, secure context, `navigator.geolocation`); `getGeolocationBackend` lazy web default / `setGeolocationBackend(null)` restore; `createWebGeolocationBackend` implements all 7 seam members with try/catch around every host call.
- **`floorLevel` fix implemented** (2026-07-02 Decision): `mapWebPosition` reads `(coords as { floorLevel?: number }).floorLevel ?? 0` with a durable comment on the non-standard field — no longer hardcoded to 0.
- **Options mapping**: `GeolocationRequestOptions` (`enableHighAccuracy`, `timeoutMs`, `maximumAgeMs`) maps to `PositionOptions` at the web seam; unit-suffixed names per convention.
- Hygiene: `sideEffects: false`, single `.` export, no dependencies beyond `@flighthq/types`; module state (`_backend`, `_emptyOptions`, `_noopUnsubscribe`) below exports; lib.dom name collision handled via a local `GlobalGeolocationPosition` alias.

## Gaps

1. **Native watch-throttling options absent** (charter Open direction #2): `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` on `GeolocationRequestOptions` — the one seam field native hosts (Core Location / FusedLocationProvider) expect that web cannot honor. Additive type + docs; needs the chartered decision on how the web backend documents ignoring them.
2. **`subscribePermission` attach race** (charter Open direction #3): the `change` listener is wired only after `permissions.query()` resolves, so a state change inside that window is missed; the unsubscribe returned before resolution also cannot cancel a pending attach.
3. **`requestGeolocationPermission` web fallback is a position probe** — when the Permissions API is absent it acquires an actual fix to trigger the prompt, a heavier side effect than "request permission" implies. Inherent to the web platform; worth a seam-doc note so native backends implement a true request.
4. **No diagnostics layer** — silent sentinels (`null`, `-1`, `'prompt'`, no-op unsubscribe) with no `explain*` / `enable*Guards`; suite-wide condition.
5. **Rust mirror `flighthq-geolocation` unstarted.**

## Charter contradictions

None. Both 2026-07-02 Decisions (full `Geolocation*` prefix; `floorLevel` read-through) are verified landed in source and tests. The domain boundary holds — acquisition only, no geospatial math (distance/bearing/geofencing) has crept in.

## Contract & docs fit

- Types-first satisfied: the complete seam and all result/permission types live in `packages/types/src/Geolocation.ts` with doc comments on sentinel semantics. The June "status claims types that are absent" honesty finding is resolved — `status.md`'s as-claimed block now matches the tree.
- Sentinels never throws; `Readonly<>` on options/position params; `GeoPositionResult` is geolocation-local pending the chartered suite-wide question (Open direction #1).
- Package Map line ("current position and position watches") still undersells the permission lifecycle + availability probe — the doc widen the June review flagged remains outstanding, behind the user's gate.

## Candidate open directions

1. Watch-throttling seam fields (charter Open direction #2) — decide and land the type before a native host commits to the narrower contract.
2. Whether `GeoPositionResult` (sentinel + reason companion) becomes a suite-wide pattern (charter Open direction #1) — `storage`/`net`/`webcam` share the same "why did it fail" need.
3. Fix the `subscribePermission` attach race (charter Open direction #3) — re-read `status.state` after attach and cancel pending attaches on unsubscribe; small, but chartered as open rather than swept.
