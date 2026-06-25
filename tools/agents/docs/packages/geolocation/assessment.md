---
package: '@flighthq/geolocation'
updated: 2026-06-25
basedOn: ./review.md
---

# geolocation — Assessment

> Recommendations over `review.md` (merge gate, REJECT, 35/100). The package-side change is solid-tier craft, but the integration tree it would land in **does not type-check**: the `@flighthq/types` Geolocation header the package was written against was dropped from `integration-b2824e3d8` (no `packages/types/src/Geolocation.ts` hunk in `changes.patch`; `head` types byte-identical to base). The build-unblock is a **cross-package** restore in `@flighthq/types`, so it is not a within-package sweep — it is the MUST-FIX in the dispatch brief (`outgoing/integration/geolocation.md`), and it is parked in Backlog here. Until it lands, nothing within the cell is safe to sweep, because the cell does not compile. The within-package items below stay valid and should be folded into the same unblock pass once the header is restored.

## Recommended

Sweep-safe: all within `@flighthq/geolocation`, no cross-package coupling, no breaking change, no open design decision. **Blocked until the dispatch brief's MUST-FIX (restore the `@flighthq/types` Geolocation header) lands** — these are not independently mergeable while the package fails to compile, but they are within-cell and carry no design decision, so they fold into the unblock pass.

1. **Read `coords.floorLevel ?? 0` in the web backend.** `mapWebPosition` hardcodes `floorLevel: 0` (`geolocation.ts:218`) instead of reading the coordinate. The field is honestly zeroed-when-unknown, but the web path will silently never populate it even once a host or future lib.dom types `GeolocationCoordinates.floorLevel`. Switch the literal to a guarded read (`(coords as { floorLevel?: number }).floorLevel ?? 0` until lib.dom types it) so the value flows the moment the platform supplies it, and pin it with a colocated test. One line, no public surface change. — review.md#minor-non-blocking

2. **Document the `subscribePermission` attach-race in source.** The listener is wired only after the `permissions.query()` promise resolves (`geolocation.ts:104-126`), so a permission change in that window is missed. Inherent to the Permissions API, not a bug — but exactly the non-obvious behavior the design rules say belongs in a code comment (the name cannot carry it). Add a one-line comment at the web `subscribePermission` noting the known query-window gap so a later agent does not "fix" it. — review.md#minor-non-blocking

3. **Confirm export/source order and contract checks are green.** After the unblock + the two edits above, run `npm run order` / `npm run exports:check` / `npm run api geolocation` and leave the file in canonical scan order (exports alphabetized, loose module state at the bottom). Sweep hygiene only; no behavior change. — review.md#what-the-delta-gets-right

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Not sweep-eligible.

- **MERGE BLOCKER — restore the `@flighthq/types` Geolocation header.** The package imports `GeolocationErrorReason`, `GeolocationPermissionState`, `GeoPositionResult`, reads `GeoPosition.floorLevel`, and calls `GeolocationBackend.getCurrentPositionResult` / `getPermission` / `subscribePermission` and a third `onError` watch param — none of which exist in the head tree. The fix is in `@flighthq/types` (cross-package), so it cannot be a within-cell sweep; it is the dispatch brief's MUST-FIX #1. **Parked: cross-package — but mandatory before merge.** — review.md#the-blocker

- **Reconcile `status.md` with the shipped tree.** The carried-in `status.md` asserts the types as landed in `@flighthq/types/src/Geolocation.ts`; they are not in this integration. The integration worker must make the status log and the tree agree (restore the hunk, or correct the log). **Parked: follows the blocker.** — review.md#the-blocker

- **Stem unification (`Geo*` → `Geolocation*`).** `clearGeoWatch`/`watchGeoPosition` use the `Geo*` stem while every other function uses `Geolocation*`; no sibling platform cell has a split stem. Inherited from base (not introduced by this delta), so not a merge blocker — but a real **breaking public-API rename**, a design fork, not a sweep. **Parked: design decision** — routed to Open directions (1). — review.md#what-the-delta-gets-right

- **Probe-verb convention (`isGeolocationAvailable` vs sibling `is*Supported`).** `haptics` and `notification` expose `is*Supported`; this cell exposes `is*Available`, a third spelling for the same capability-probe concept, with no `getGeolocationCapabilities` companion. A **suite-wide naming ruling**, not a within-cell change. **Parked: cross-package / design decision** — routed to Open directions (2).

- **Native watch-throttling options (`minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs`).** Maps to Android `LocationRequest` distance/interval and iOS `distanceFilter`. Adds options the web backend silently drops, so an explicit yes/no, not a sweep. **Parked: design decision** — routed to Open directions (3).

- **`GeoPositionResult` as a suite-wide pattern.** Whether the "sentinel form + reason-carrying `*Result` form" pairing is a geolocation-local choice or a platform-suite convention (and a Package Map line) is a cross-cell decision. **Parked: cross-package / design decision** — routed to Open directions (5).

- **`@flighthq/host-electron` / native backend.** The `GeolocationBackend` trait is full-surface, but only the web backend exists. The native implementation lives in the host adapter, not this cell. **Parked: cross-package** — correctly deferred. — review.md#what-the-delta-gets-right

- **Rust `flighthq-geolocation` crate.** `crate: flighthq-geolocation` is declared but unbuilt; the free functions, the `GeolocationBackend` trait, and the four new types need to land in the port with a native-default + `host-web` backend, plus any web/native sentinel divergence recorded in the conformance map. Cannot start until the TS types header exists (the blocker). **Parked: other worktree** — confirm port priority via Open directions (4).

- **Package Map widening + suite-preamble `*Result` note.** The map line reads "current position and position watches" and understates the shipped permission lifecycle + availability probe; the suite preamble does not mention the `*Result` companion. **Parked: user's gate** — doc edits outside the cell, gated on the `*Result`-as-convention decision above. — review.md#where-the-admin-docs-need-revising

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

The charter's North star, Boundaries, Decisions, and Open directions are all still empty; the cell honors the one **What it is** boundary (acquisition, not geospatial math) exactly. These are the silences this assessment had to assume past — surfaced for an explicit direction conversation, not actioned:

- **API fork — stem unification** (`clearGeoWatch`→`clearGeolocationWatch`, `watchGeoPosition`→`watchGeolocationPosition`, leaving `GeoPosition*` for the entity only). A breaking rename that needs a Decision.
- **Cross-package convention — probe verb** (`is*Available` vs `is*Supported`, and whether a `getGeolocationCapabilities` companion is wanted), a structural-forks-style suite ruling.
- **Scope — native throttling options** (adopt `minimumUpdateDistanceMeters` / `minimumUpdateIntervalMs` web-ignored, sentinel-style, or not).
- **Scope — Rust crate priority** (confirm the port is in scope now the TS surface has stabilized, and the native default's sentinel posture behind the `native` cargo feature).
- **Pattern — `GeoPositionResult` suite-wide** (geolocation-local vs a platform-suite convention worth documenting in the map).
