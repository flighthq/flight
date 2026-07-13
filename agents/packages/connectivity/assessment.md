---
package: '@flighthq/connectivity'
updated: 2026-07-13
basedOn: ./review.md
---

# connectivity — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

None. Both previously-recommended fixes are verified implemented in source (2026-07-13): the reachability fallback caches its web backend in `_cachedWebBackend` (`connectivity.ts:147`), and `anyAbortSignal` removes both listeners inside `onAbort` (`connectivity.ts:232-236`). Everything remaining is parked for a design-decision, cross-package, or native-backend reason (see Backlog).

## Approved

1. **Fix `detectConnectivityReachability` fallback** [2026-07-02 · blanket "platform integration suite sweep"]
2. **Fix `anyAbortSignal` listener leak** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- **Continuous reachability monitor** (`createConnectivityReachabilityMonitor` — backoff, quorum probing, captive-portal detection) — gated on charter Open direction 1 (ownership: this package vs a sibling); the first async sub-entity in the domain.
- **`captivePortal` field on `ConnectivityReachability`** — types-header + design addition; pairs with the monitor design.
- **Fallback routing policy** when a native backend lacks `detectReachability` (web-fetch fallback always vs sentinel) — charter Open direction 2; a policy ruling, not a code sweep.
- **`estimateConnectivityQuality`** — value unrealized until non-web backends exist.
- **`host-electron` `ConnectivityBackend`** — cross-package (`@flighthq/host-electron`).
- **Rust crate `flighthq-connectivity`** — cross-boundary; TS shape now stable enough to mirror.
