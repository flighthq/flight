---
package: '@flighthq/connectivity'
status: solid
score: 85
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - source (packages/connectivity/src)
  - packages/types/src/Connectivity.ts
  - prior review (2026-06-25 merge gate, integration-b2824e3d8)
---

# connectivity — Review

## Verdict

**solid — 85/100.** The 2026-06-25 merge-gate REJECT is fully resolved and superseded: that review scored the *integration bundle*, which had dropped the `@flighthq/types/src/Connectivity.ts` hunk and did not compile. The current tree carries the complete header — the 9-member `ConnectivityConnectionType` (incl. `'vpn'`/`'wimax'`/`'other'`), the 8-field `ConnectivityStatus` (`downlinkMax`/`rtt`/`saveData`/`metered` present), `ConnectivityReachability`/`ConnectivityReachabilityOptions`, the optional `ConnectivityBackend.detectReachability`, and the 5-signal `Connectivity` entity — and `packages/connectivity/src/connectivity.ts` implements exactly against it. Both charter Decisions (2026-07-02) are **implemented in source**: the reachability fallback now caches its web backend in `_cachedWebBackend` (`connectivity.ts:147`), and `anyAbortSignal`'s composite fallback removes both listeners inside `onAbort` (`connectivity.ts:232-236`). The prior review's own estimate — "would score in the high 80s if its types shipped" — is now the honest baseline; the design praise from that review stands, and the remaining distance to authoritative is the parked reachability-monitor tier plus web-inherent fidelity limits.

## Present capabilities

Verified against source (14 exports, each with a mirrored `describe` in `connectivity.test.ts`):

- **Event quartet** — `createConnectivity` / `attachConnectivity` / `detachConnectivity` / `disposeConnectivity`. Attach is idempotent (tears down a prior subscription first) and emits `onChange` plus three edge signals: online/offline transitions, `onConnectionTypeChange`, `onMeteredChange`.
- **Snapshot layer** — `createConnectivityStatus` (zeroed `out` constructor), `getConnectivityStatus(out)`, and the level conveniences `isConnectivityOnline` / `isConnectivityMetered` / `isConnectivitySaveDataEnabled` over a shared module scratch.
- **Status diff** — `hasConnectivityStatusChanged(a, b)`: pure field-by-field compare over all 8 fields, alias-safe by construction.
- **Backend seam** — `getConnectivityBackend` / `setConnectivityBackend` / `createWebConnectivityBackend`; lazy web default over `navigator.onLine` + the Network Information API + `window` online/offline events, with SSR guards throughout. `mapWebConnectionType` covers the full 9-member union.
- **One-shot reachability probe** — `detectConnectivityReachability(options, out)`: delegates to `backend.detectReachability` when present, else falls back to a cached web backend's fetch-HEAD probe with timeout + caller `AbortSignal` combination (`AbortSignal.any` when available, leak-free composite fallback otherwise). Sentinel (`reachable: false`, `latency: -1`), never throws.

Tests: 14 describe blocks, alphabetized, mirroring exports; cover edge-signal transitions, attach idempotency, alias-safe diff, SSR sentinel and backend-delegation probe paths.

## Gaps

Held to the AAA rubric (online/offline, connection type/quality, metered, save-data, change signals — all present), what remains:

1. **No continuous reachability monitor.** The canonical top tier — `createConnectivityReachabilityMonitor` with backoff, quorum probing over multiple URLs, and captive-portal detection — is absent. Deliberately parked on charter Open direction 1 (ownership: this package vs a sibling). This is the main distance to authoritative.
2. **No captive-portal signal.** `ConnectivityReachability` has no `captivePortal` field; a HEAD 200-vs-redirect mismatch check is a known, cheap extension — but it is a types-header + design addition, not sweep-safe.
3. **Web `metered` is a heuristic** (`saveData || type === 'cellular'`) — mis-classifies cellular-tethered WiFi and unlimited plans. Inherent to the web platform; documented in the field comment; charter Open direction 3. Only a native OS-metered flag fixes it.
4. **No quality estimation** (`estimateConnectivityQuality` deriving an effectiveType-class from observed probe latency on NetInfo-less hosts). Low value until native backends exist; parked.
5. **No native backend in-box** — `host-electron` has no `ConnectivityBackend`; cross-package.
6. **Fallback routing policy is still implicit.** When a native backend lacks `detectReachability`, the probe silently routes through the web fetch path. The allocation bug is fixed, but the *policy* question (fallback-always vs sentinel) remains charter Open direction 2.

## Charter contradictions

None. Both charter Decisions are now satisfied in source (a future direction pass may want to note them discharged — the Decisions ledger itself stays append-only). The "What it is" paragraph matches the shipped surface exactly.

## Contract & docs fit

- **Types-first: PASS** (the June blocker is gone — full shape navigable from `@flighthq/types/src/Connectivity.ts` alone).
- Naming, out-params, sentinels, `Readonly<>`, single `.` barrel, `sideEffects: false`, module state at file bottom, no top-level registration: all PASS, as the prior review already credited the runtime.
- **Cell-doc drift:** this cell's `status.md` (and formerly this review) still titles the package "network" from before the rename; the status log's as-claimed block cites `packages/network/*` paths that are now `packages/connectivity/*`. Status is append-only and not this pass's to rewrite — flagged for the next ingest pass.

## Candidate open directions

- Reachability monitor ownership + shape (charter Open direction 1) — the single biggest maturity step.
- Fallback routing policy for probe-less native backends (Open direction 2).
- `captivePortal` field on `ConnectivityReachability` (pairs with the monitor design).
- Rust crate `flighthq-connectivity` — TS shape is now stable enough to mirror.
