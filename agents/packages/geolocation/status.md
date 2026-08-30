---
package: '@flighthq/geolocation'
updated: 2026-08-30
by: builder2
---

# geolocation — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/geolocation/src/`, `packages/types/src/Geolocation.ts`, and the one
shipped native adapter on 2026-08-08. Most of what this file carried had already landed; what is left
is short on purpose. A file:line here is a claim about this tree, not about a session.

- **No native watch-throttling options.** `GeolocationRequestOptions` carries only
  `enableHighAccuracy`, `timeoutMs`, `maximumAgeMs` (`types/src/Geolocation.ts`). Android's
  `LocationRequest` distance/interval floor and iOS's `distanceFilter` have nowhere to land, so a
  native host cannot be told to throttle a watch. Adding fields the web backend must ignore is the
  ordinary platform-suite pattern, but it is still an explicit decision rather than an oversight.
- **The permission-watch race is RESOLVED BY REMOVAL, not by a fix.** `subscribePermission` is gone
  from this package — permission state and change belong to `@flighthq/permissions`. Recorded rather
  than deleted so the next reader does not conclude the race was repaired in place: nothing here was
  repaired, the surface carrying the race left. `@flighthq/permissions` has no change feed today, so
  whoever adds one must not reproduce the pattern.
- **Native coverage is Capacitor only**, and it is the weaker half of the seam.
  `createCapacitorGeolocationBackend` (`host-capacitor/src/capacitorGeolocation.ts`) is registered at
  `capacitorRegister.ts:48`; there is no Electron geolocation adapter. Capacitor exposes no
  `getCurrentPositionResult` collapses every failure to `reason: 'unavailable'` — the typed
  denied/timeout distinction that `GeoPositionResult` exists for is unavailable on the one native host.
  Its `promptForAccess` IS the strong half: Capacitor has a real permission-request API, so it prompts
  without acquiring a fix, which is exactly what naming the operation was for.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Permission ownership split. This package now owns POSITION plus ONE named prompt
  mechanism, `promptForGeolocationAccess` / `GeolocationBackend.promptForAccess`, returning the
  capability-native `GeolocationAccessOutcome`
  (granted/denied/dismissed/timeout/cleanup-failed/runtime-unavailable/operation-failed).
  `getGeolocationPermission`, `requestGeolocationPermission` and `onGeolocationPermissionChange` are
  DELETED, as are the three matching backend members and the `GeolocationPermissionState` clone of
  `PermissionState`. `@flighthq/permissions` projects the outcome via `Host.system.geolocation`, so
  no package dependency was added in either direction. `timeout` is capability-native by ruling: a
  position deadline is an acquisition observable and says nothing about the user, and only the
  permission owner may query state to disambiguate it — so the capability reports what it saw and
  Permissions carries it through as a reason with NO state.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Both headline deferred items checked out
  **false**. The stem split is closed: the functions are `clearGeolocationWatch` (`geolocation.ts:11`)
  and `watchGeolocationPosition` (`:195`), not `clearGeoWatch` / `watchGeoPosition`, so the "breaking
  rename, surface to the user first" thread is history. And `floorLevel` is no longer hard-zeroed from
  the web backend — `mapWebPosition` reads `(coords as { floorLevel?: number }).floorLevel ?? 0`
  (`:220`), so an indoor-positioning host that populates it comes through.
- **2026-06-24** — Geolocation matured: `GeolocationPermissionState` and `GeolocationErrorReason`,
  the `GeoPositionResult` reason-carrying read, `getGeolocationPermission` /
  `onGeolocationPermissionChange` / `isGeolocationAvailable`, and a typed `onError` on the watch that
  the web backend actually wires.
