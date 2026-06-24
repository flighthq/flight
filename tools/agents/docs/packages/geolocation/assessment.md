---
package: '@flighthq/geolocation'
updated: 2026-06-24
basedOn: ./review.md
---

# geolocation — Assessment

> Recommendations over `review.md` (solid, 88/100). The `builder-67dc46d64` pass already took the cell from a read+watch+request skeleton to the full W3C surface — permission lifecycle, typed error reasons, the `*Result` explicit-data companion, the availability probe, and `onError` watch delivery — so the prior depth roadmap is effectively absorbed and there is no separate `reviews/maturation/depth/geolocation.md` left to remove. What remains within the cell is a thin finish line; the substantive open items are all breaking renames, cross-package conventions, or the Rust port, none of which are sweep-safe. Those are routed to the charter's Open directions below.

## Recommended

Sweep-safe: all within `@flighthq/geolocation`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

1. **Read `coords.floorLevel ?? 0` in the web backend.** `mapWebPosition` hardcodes `floorLevel: 0` (head bundle `geolocation.ts:218`) instead of reading the coordinate. The field is honestly zeroed-when-unknown, but the web path will silently never populate it even once a host or future lib.dom does type `GeolocationCoordinates.floorLevel`. Switch the literal to a guarded read (`(coords as { floorLevel?: number }).floorLevel ?? 0` until lib.dom types it) so the value flows the moment the platform supplies it, and pin the read with a colocated test. One line, no public surface change. — review.md#gaps

2. **Document the `subscribePermission` attach-race in source.** The listener is wired only after the `permissions.query()` promise resolves, so a permission change in that window is missed. This is inherent to the Permissions API and not a bug, but it is exactly the kind of non-obvious behavior the design rules say belongs in a code comment (the name cannot carry it). Add a one-line comment at the `subscribePermission` web implementation noting the known query-window gap so a later agent does not read it as an oversight and "fix" it. — review.md#gaps

3. **Confirm export/source order and contract checks are green.** Run `npm run order` / `npm run exports:check` / `npm run api geolocation` over the cell after the two edits above and leave the file in canonical scan order (exports alphabetized, loose module state at the bottom). Sweep hygiene only; no behavior change. — review.md#contract-&-docs-fit

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **Stem unification (`Geo*` → `Geolocation*`).** `clearGeoWatch`/`watchGeoPosition` use the `Geo*` stem while every other function uses `Geolocation*`; no sibling platform cell has a split stem. The fix is real and worth doing, but it is a **breaking public-API rename** — a design fork, not a sweep. The status doc itself flags it to surface before acting. **Parked: design decision** — routed to Open directions (1). — review.md#gaps, #candidate-open-directions (1)

- **Probe-verb convention (`isGeolocationAvailable` vs sibling `is*Supported`).** `haptics` and `notification` expose `is*Supported`; this cell exposes `is*Available`, a third spelling for the same capability-probe concept, and has no `getGeolocationCapabilities` companion. Settling this — and whether a capabilities descriptor is wanted — is a **suite-wide naming ruling**, not a within-cell change. **Parked: cross-package / design decision** — routed to Open directions (2). — review.md#gaps, #candidate-open-directions (2)

- **Native watch-throttling options (`minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs`).** Maps to Android `LocationRequest` distance/interval and iOS `distanceFilter`. Adds options the web backend silently drops, so it is an explicit yes/no, not a sweep. **Parked: design decision** — routed to Open directions (3). — review.md#gaps, #candidate-open-directions (3)

- **`GeoPositionResult` as a suite-wide pattern.** Whether the "sentinel form + reason-carrying `*Result` form" pairing is a geolocation-local choice or a platform-suite convention (and a Package Map line) is a cross-cell decision. **Parked: cross-package / design decision** — routed to Open directions (5). — review.md#candidate-open-directions (5)

- **`@flighthq/host-electron` / native backend.** The `GeolocationBackend` trait is now full-surface, but only the web backend exists. The native implementation lives in the host adapter, not this cell. **Parked: cross-package** — correctly deferred by the worker. — review.md#gaps

- **Rust `flighthq-geolocation` crate.** `crate: flighthq-geolocation` is declared but unbuilt; the free functions, the `GeolocationBackend` trait, and the four new types (`GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, `GeoPosition.floorLevel`) need to land in the port with a native-default + `host-web` backend, plus any web/native sentinel divergence recorded in the conformance map. **Parked: other worktree** — out of scope for this TS worktree; confirm port priority via Open directions (4). — review.md#gaps, #candidate-open-directions (4)

- **Package Map widening + suite-preamble `*Result` note.** The map line reads "current position and position watches" and understates the shipped permission lifecycle + availability probe; the suite preamble does not mention the `*Result` explicit-data companion. **Parked: user's gate** — doc edits outside the cell, surfaced for the user (not actioned here, and gated on the `*Result`-as-convention decision above). — review.md#contract-&-docs-fit

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

The charter's North star, Boundaries, Decisions, and Open directions are all still empty; the cell honors the one **What it is** boundary (acquisition, not geospatial math) exactly. These are the silences this assessment had to assume past — surfaced for an explicit direction conversation, not actioned:

- **API fork — stem unification** (`clearGeoWatch`→`clearGeolocationWatch`, `watchGeoPosition`→`watchGeolocationPosition`, leaving `GeoPosition*` for the entity only). A breaking rename that needs a Decision. — review.md#candidate-open-directions (1)
- **Cross-package convention — probe verb** (`is*Available` vs `is*Supported`, and whether a `getGeolocationCapabilities` companion is wanted), a structural-forks-style suite ruling. — review.md#candidate-open-directions (2)
- **Scope — native throttling options** (adopt `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` web-ignored, sentinel-style, or not). — review.md#candidate-open-directions (3)
- **Scope — Rust crate priority** (confirm the port is in scope now the TS surface has stabilized, and the native default's sentinel posture behind the `native` cargo feature). — review.md#candidate-open-directions (4)
- **Pattern — `GeoPositionResult` suite-wide** (geolocation-local vs a platform-suite convention worth documenting in the map). — review.md#candidate-open-directions (5)
