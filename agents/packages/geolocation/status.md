---
package: '@flighthq/geolocation'
updated: 2026-08-08
by: principal
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
- **Unsubscribing from a permission watch can lose the race.** The web `subscribePermission` attaches
  its `change` handler inside the `permissions.query()` continuation (`geolocation.ts:109-118`), while
  the unsubscribe it returns runs against `status` / `handler` that are still `null` until then
  (`:119-125`). Unsubscribe before the query resolves and the handler is attached afterwards anyway —
  the listener keeps firing with no way to detach it. A change *during* that window is also missed.
- **Native coverage is Capacitor only**, and it is the weaker half of the seam.
  `createCapacitorGeolocationBackend` (`host-capacitor/src/capacitorGeolocation.ts`) is registered at
  `capacitorRegister.ts:48`; there is no Electron geolocation adapter. Capacitor exposes no
  permission-change event, so `subscribePermission` is inert there, and its
  `getCurrentPositionResult` collapses every failure to `reason: 'unavailable'` — the typed
  denied/timeout distinction that `GeoPositionResult` exists for is unavailable on the one native host.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

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
