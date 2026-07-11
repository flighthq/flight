---
package: '@flighthq/connectivity'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# network — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

No-op sweep, by design. Read `assessment.md` › Recommended: it is explicitly **"None."** Every remaining roadmap item is parked for a cross-package, open-direction, or user-gated reason, so there is no within-package, sweep-safe, non-design code change to make.

- **Done:** verified the package's own tests still pass (`npm run test --workspace=packages/network` → 1 file, 32 tests passing).
- **Parked (carried from the assessment Backlog, all out of this sweep's hard boundary):**
  - In-box native backend (`host-electron` `ConnectivityBackend`) — cross-boundary: `@flighthq/host-electron` + `registerElectronBackends`.
  - `host-capacitor` mobile backend — cross-boundary: a package that does not yet exist.
  - Continuous reachability monitor (`createConnectivityReachabilityMonitor`) — design decision: gated on Open direction 1 (ownership/shape), first async sub-entity.
  - `estimateConnectivityQuality(out)` — parked behind the native-backend track; value unrealized until a non-web backend feeds it (review: low priority until native backends exist).
  - Rust crate `flighthq-network` — cross-boundary: `crates/`, `flighthq-types`, conformance map.
  - Package Map one-clause widening — cross-boundary: `agents/index.md`, user-gated doc edit.
  - Retire the seed roadmap (`reviews/maturation/depth/network.md`) — cross-boundary doc delete, user-gated.

No source, test, barrel, or manifest edits were made under `packages/network/`. The cell is at a healthy end state for the no-native-backend stage.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/connectivity

**Session date**: 2026-06-24 **Previous score**: 78/100 (solid) **Estimated new score**: 91/100

## Implemented APIs

### Types (`packages/types/src/Connectivity.ts`)

- **`ConnectivityConnectionType`** — widened from 6 to 9 members: added `'wimax'`, `'vpn'`, `'other'` (full Capacitor/NetInfo set)
- **`ConnectivityStatus`** — three new fields:
  - `saveData: boolean` — Network Information API `connection.saveData`; "user/OS asked to conserve data"
  - `rtt: number` — round-trip time estimate in ms, `-1` sentinel when unreported
  - `metered: boolean` — true when the connection is metered (cellular or saveData is set)
  - `downlinkMax: number` — max plausible downlink for the underlying technology, `-1` sentinel
- **`ConnectivityReachabilityOptions`** — options for a one-shot reachability probe (`url`, `timeout`, `signal`)
- **`ConnectivityReachability`** — result type for a probe (`reachable: boolean`, `latency: number`)
- **`ConnectivityBackend.detectReachability`** — optional async method on the backend seam for reachability probing
- **`Connectivity`** entity — two new edge-triggered signals:
  - `onConnectionTypeChange: Signal<(type: ConnectivityConnectionType) => void>`
  - `onMeteredChange: Signal<(metered: boolean) => void>`

### Implementation (`packages/network/src/network.ts`)

New exported functions:

- **`hasConnectivityStatusChanged(a, b): boolean`** — field-by-field diff; returns true if any field differs; alias-safe (same object returns false)
- **`isConnectivityMetered(): boolean`** — convenience over `getConnectivityStatus`; mirrors `isConnectivityOnline`
- **`isConnectivitySaveDataEnabled(): boolean`** — direct read of the save-data flag
- **`detectConnectivityReachability(options, out): Promise<ConnectivityReachability>`** — one-shot reachability probe; delegates to `backend.detectReachability` when present, falls back to the web backend's fetch-based implementation; returns a sentinel (`reachable: false`, `latency: -1`) on failure rather than throwing

Updated existing functions:

- **`attachConnectivity`** — now also tracks `wasType` and `wasMetered`; emits `onConnectionTypeChange` and `onMeteredChange` on transitions
- **`createConnectivity`** — now creates entities with all 5 signals including the two new ones
- **`createConnectivityStatus`** — initializes `saveData: false`, `rtt: -1`, `metered: false`, `downlinkMax: -1`
- **`createWebConnectivityBackend`** — reads `connection.rtt`, `connection.saveData`, `connection.downlinkMax`; derives `metered` from `saveData || type === 'cellular'`; implements `detectReachability` via `fetch` + `AbortController` with configurable timeout and external cancellation support; `anyAbortSignal` helper uses `AbortSignal.any` when available, falls back to a composite controller
- **`mapWebConnectionType`** — added cases for `'wimax'`, `'vpn'`, `'other'`

### Tests (`packages/network/src/network.test.ts`)

Grew from 8 describe blocks / ~14 tests to 14 describe blocks / 32 tests. New coverage:

- `attachConnectivity`: onOnline edge, onConnectionTypeChange edge, no-emit when type unchanged, onMeteredChange edge, idempotency under double-attach
- `createConnectivity`: 5-signal entity shape
- `createConnectivityStatus`: all 8 fields at sentinel values
- `createWebConnectivityBackend`: rtt/downlinkMax sentinels in jsdom
- `detachConnectivity`: safe-when-not-attached
- `disposeConnectivity`: safe-when-not-attached
- `hasConnectivityStatusChanged`: 7 cases including same-object alias safety
- `isConnectivityMetered`: false and true cases
- `isConnectivityOnline`: false and true cases
- `isConnectivitySaveDataEnabled`: false and true cases
- `detectConnectivityReachability`: SSR sentinel guard, backend delegation

## Deferred Items

### Reachability maturity (Silver/Gold design gate)

The roadmap calls for a continuous reachability monitor with backoff (`createConnectivityReachabilityMonitor` / `attachConnectivityReachabilityMonitor` / `detachConnectivityReachabilityMonitor` / `disposeConnectivityReachabilityMonitor`), quorum probing over multiple URLs, and captive-portal detection. This is the first async sub-entity in the network domain and warrants a cross-package design discussion before building:

- **Ownership**: Should `ConnectivityReachabilityMonitor` live in `@flighthq/connectivity` or a sibling `@flighthq/connectivity-reachability`? Recommendation: keep it in `@flighthq/connectivity` as an opt-in sub-entity (the polling cost is only assumed when the entity is created and attached), but surface this before acting.
- **Async on the backend seam**: `detectReachability` is already async on the `ConnectivityBackend` trait. The Rust port concern (native seam should stay clean; `host-web` bridges `!Send fetch`/`JsFuture` internally) is recorded but not acted on here — it is a Rust-session decision.

### Native backends (Gold)

`@flighthq/host-electron` needs a `ConnectivityBackend` implementation over `net.online` + system network change events, wired into `registerElectronBackends`. This is a cross-package change (requires modifying `host-electron`) — not acted on here. The `host-capacitor` path does not yet exist.

### Rust crate (Gold)

`flighthq-connectivity` crate: mirror `ConnectivityStatus`, `ConnectivityConnectionType`, `ConnectivityBackend` trait, reachability types in `flighthq-types`; native default backend behind the `native` cargo feature; `host-web` (wasm) over the Network Information API. Should be ported after the TS type shape is stable (it is now stable enough). Record in the conformance map. Deferred to a dedicated Rust session.

### Bandwidth/quality estimation (Gold)

`estimateConnectivityQuality` deriving an `effectiveType`-style class from observed probe latency/throughput when the host lacks NetInfo API support (Firefox/Safari, most native shells). Low priority until native backends exist.

### Docs (Gold)

A package-level note (README or inline) documenting the `navigator.onLine` "interface, not internet" caveat, when to use `online` vs `detectConnectivityReachability`, and the metered/save-data decision matrix. The `detectConnectivityReachability` function already carries a doc comment covering this caveat, but a dedicated section would help.

## Concerns and Surprises

- **`anyAbortSignal` polyfill**: `AbortSignal.any` is supported in modern browsers but not in all environments (not in Node < 20, not in older jsdom). The polyfill composite-controller approach is correct but adds a small listener-leak risk if neither signal ever fires and the composite controller is GC'd before the parent signals. In practice this is benign for short-lived probes.
- **`metered` derivation**: The web backend derives `metered` from `saveData || type === 'cellular'`. This is a heuristic — a WiFi tethered from a cellular plan is not detected as metered, and some cellular connections are unlimited. Native backends can report the OS metered flag directly, which is more accurate. The heuristic is documented in the field comment.
- **SSR safety**: `detectConnectivityReachability` returns a sentinel when `fetch` is `undefined`, consistent with the existing SSR-guard pattern. The `createWebConnectivityBackend` subscription path also guards against `typeof window === 'undefined'`.

## Suggestions for Future Sessions

1. **Reachability monitor** — design-gate answered, then implement `createConnectivityReachabilityMonitor` with backoff and quorum probing as a sub-entity in `@flighthq/connectivity`. This alone would push the package to Gold-minus.
2. **Host-electron wiring** — implement `ConnectivityBackend` in `@flighthq/host-electron` over `net.online` and `powerMonitor` events. The seam is ready; only the adapter is missing.
3. **Rust crate** — `flighthq-network` with a native default backend is well-defined; port now that the TS type shape is stable.
4. **Captive portal detection** — extend `detectConnectivityReachability` to detect captive portals (HEAD returns 200 OK vs. redirect/non-standard 204 mismatch from the known target). Add `captivePortal: boolean` to `ConnectivityReachability`.
