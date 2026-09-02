---
package: '@flighthq/connectivity'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (packages/connectivity/src)
  - packages/types/src/Connectivity.ts
  - packages/types/src/Host.ts (HasConnectivity* witnesses)
  - packages/host-web/src/webConnectivity.ts
  - packages/host-web/src/webConnectivityHost.ts
  - packages/host-capacitor/src/capacitorConnectivity.ts
  - packages/host-electron/src/electronRegister.ts
  - packages/host-tauri/src/tauriRegister.ts
  - prior review (2026-07-13)
  - prior assessment (2026-07-13)
---

# connectivity -- Review

## Verdict

**solid -- 82/100.** The 2026-08-29 rewrite replaced the ambient `ConnectivityBackend` with explicit
Host witnesses (`HasConnectivityStatus`, `HasConnectivityChange`, `HasConnectivityReachability`),
deleted `createConnectivityStatus` (status is a backend-produced query, not a user identity), and
added `destroyConnectivity` for terminal provider teardown. The result is a leaner 11-export surface
that implements Flight's explicit dependency model more faithfully than the prior ambient-backend shape.
All 11 exports have matching `describe` blocks (16 test cases total) covering the core diff-signal
machinery, subscription lifecycle, idempotent attach/detach/dispose, and the host-delegated
reachability path. The remaining distance to authoritative is the parked continuous-monitor tier plus
the open-direction gaps the charter names.

## Present capabilities

Verified against source (`packages/connectivity/src/connectivity.ts`, 141 lines; 11 exports):

- **Event entity** -- `createConnectivity()` returns an Entity carrying five signals: `onChange`,
  `onConnectionTypeChange`, `onMeteredChange`, `onOnline`, `onOffline`. These are core-owned diff
  signals, not raw host events.
- **Attach/detach lifecycle** -- `attachConnectivity(host, connectivity)` takes a
  `HasConnectivityStatus & HasConnectivityChange` host, reads initial status for baseline state, and
  subscribes to the change provider. On each raw provider change, it reads a fresh status snapshot,
  emits `onChange`, then diffs against the prior baseline to emit edge signals for online/offline
  transitions, connection-type changes, and metered-state changes. Returns `false` when the change
  provider cannot establish a real subscription (the provider returns `null` from `subscribe`).
  Re-attaching always consumes the prior provider's exact unsubscribe before touching the new one.
  `detachConnectivity(connectivity)` consumes the stored unsubscribe once and is idempotent.
- **Dispose** -- `disposeConnectivity(connectivity)` detaches and clears all five signals.
- **Destroy** -- `destroyConnectivity(host)` invokes `host.connectivity.change.destroy()` for
  terminal provider teardown, deliberately separate from per-entity detach so a shared provider is
  not destroyed when one of several entities disconnects.
- **Snapshot queries** -- `getConnectivityStatus(host, out)` reads a full `ConnectivityStatus`
  snapshot into an `out` parameter. `getConnectivityOnline(host)` returns `boolean | null` (null
  means unmeasured, distinct from offline). `isConnectivityMetered(host)` and
  `isConnectivitySaveDataEnabled(host)` are convenience readers.
- **Status diff** -- `hasConnectivityStatusChanged(a, b)` compares all 8 fields, alias-safe.
- **One-shot reachability** -- `detectConnectivityReachability(host, options, out)` delegates to
  `host.connectivity.reachability.detectReachability(options, out)`. The host provides the
  implementation; the core package holds no web-specific fallback.

Host backend coverage (outside this package, verified for completeness):

- **Web** (`host-web/src/webConnectivity.ts`): `createWebConnectivityBackend()` implements all three
  backend facets (status, change, reachability). One module singleton serves
  `webConnectivityHost`. Status reads `navigator.onLine` + Network Information API. Change
  subscribes `window` online/offline events and the connection `change` event. Reachability probes
  via `fetch` HEAD with timeout + `AbortSignal` combination (uses `AbortSignal.any` when available,
  leak-free composite fallback otherwise). `anyAbortSignal` now properly removes listeners.
- **Capacitor** (`host-capacitor/src/capacitorConnectivity.ts`): `createCapacitorConnectivityBackend`
  implements status + change (no reachability). Starts unknown (`online: null`), registers the
  native `networkStatusChange` listener, resolves initial `getStatus` with race protection (a newer
  event is never overwritten by a late initial result), and notifies subscribers on initial
  readiness.
- **Electron/Tauri**: both expose `connectivity: {}` -- no slots populated. This is intentional
  (charter-documented).

Tests (`connectivity.test.ts`): 11 `describe` blocks, alphabetized, one per export. 16 `it` cases
covering: core-diff emission from raw provider changes, unknown-as-unmeasured semantics (offline
emitted only after measured transition), subscription failure sentinel, re-attach idempotency
(old-origin silenced, new-origin active), distinct snapshot emission (no retained mutation),
entity shape, terminal destroy idempotency, detach idempotency, host-delegated reachability dispatch,
dispose clearing all signals, and convenience reader delegation.

## Gaps

Held to the AAA rubric for a connectivity abstraction (online/offline, connection type/quality,
metered, save-data, change signals -- all present), what remains:

1. **No continuous reachability monitor.** A continuous monitor with backoff, quorum probing over
   multiple URLs, and captive-portal detection is absent. Parked on charter Open direction 1
   (ownership: this package vs a sibling). This is the single biggest distance to authoritative.
2. **No captive-portal signal.** `ConnectivityReachability` reports only `reachable` and `latency`.
   A HEAD 200-vs-redirect heuristic is a known cheap extension but is a types-header + design
   addition.
3. **Web `metered` remains heuristic.** `saveData || type === 'cellular'` mis-classifies
   cellular-tethered WiFi and unlimited plans. Inherent to the web platform; documented in the
   charter Open direction 3. Only a native OS metered flag fixes it.
4. **No quality estimation.** An `estimateConnectivityQuality` deriving an effectiveType-class from
   observed probe latency on NetInfo-less hosts has low value until non-web backends exist.
5. **No in-box native backend** -- Electron and Tauri expose empty `connectivity: {}`.
   Cross-package.

## Charter contradictions

None found. The three 2026-08-29 Decisions are all accurately reflected in the source:

- **Explicit Host split**: the ambient `get*Backend`/`set*Backend`/precedence family is gone; every
  function takes the exact `Has*` witness it requires.
- **Unknown distinct from offline**: `getConnectivityOnline` returns `boolean | null`; `attachConnectivity`
  baselines on the initial `online` value and emits `onOffline` only on a `true -> false` transition,
  never on `null -> null` or `null -> false` where the prior was unmeasured. (The test "treats unknown
  as unmeasured and emits offline only after a measured transition" verifies this.)
- **Status snapshots are query values**: `createConnectivityStatus` is deleted; the package-private
  `connectivityStatusOut()` allocates sentinel snapshots for internal reads only.
- **Change providers own terminal teardown**: `destroyConnectivity(host)` calls
  `host.connectivity.change.destroy()`.

The two older 2026-07-02 fix Decisions (`detectConnectivityReachability` fallback allocation and
`anyAbortSignal` listener leak) are superseded by the 2026-08-29 architecture change: the
connectivity package no longer contains any web-specific fallback or `anyAbortSignal`; that code
now lives in `host-web`. The fixes remain implemented there (verified: `anyAbortSignal` at
`webConnectivity.ts:122-135` properly removes listeners on abort).

## Contract & docs fit

**(a) Package against the contract:**

- **Types-first**: PASS. All types (`Connectivity`, `ConnectivityStatus`, `ConnectivityConnectionType`,
  `ConnectivityReachability`, `ConnectivityReachabilityOptions`, the three `*Backend` interfaces, the
  three `Has*` witnesses) live in `@flighthq/types` (`Connectivity.ts` and `Host.ts`). The
  implementation package exports functions only.
- **Export lanes**: PASS. `.` (index.ts) is the public lane with 11 re-exports from `./contract`.
  `./contract` (contract.ts) re-exports everything from `./connectivity`. No other subpaths.
- **`sideEffects: false`**: PASS. Declared in `package.json`. No top-level registration.
- **Naming**: PASS. Full unabbreviated names: `Connectivity` in every function name.
  `destroyConnectivity`/`disposeConnectivity` use the correct teardown verbs per convention.
- **Out-parameters**: PASS. `getConnectivityStatus(host, out)` and
  `detectConnectivityReachability(host, options, out)` write to caller-supplied `out`.
- **Sentinels, not throws**: PASS. `attachConnectivity` returns `false` on failure.
  `connectivityStatusOut()` uses `-1` sentinels for unreported fields, `null` for unmeasured online.
- **`Readonly<>`**: PASS. `hasConnectivityStatusChanged` takes `Readonly<ConnectivityStatus>` params;
  `detectConnectivityReachability` takes `Readonly<ConnectivityReachabilityOptions>`.
- **Explicit dependencies**: PASS. Every function takes the host it needs as a parameter.
- **Module-scoped state**: The `_subscriptions` WeakMap (`connectivity.ts:140`) is module-scoped
  mutable state. It maps each `Connectivity` entity to its unsubscribe callback and is how
  `detachConnectivity` finds the right release. A runtime-slot approach (storing the unsubscribe on
  the entity's runtime object) would avoid module state entirely. The WeakMap is benign in practice
  (does not prevent GC, is keyed by entity, is inaccessible outside the module), but it is
  technically module-scoped mutable state that functions reach for, which the design constraints
  discourage. Flagged as a minor observation.
- **File layout**: PASS. Module variables (`_subscriptions`, `connectivityStatusOut`) are at file
  bottom, after exports. Exports are alphabetized.

**(b) Contract/admin docs against the package shape:**

- **Prior review (2026-07-13) is fully stale.** It describes 14 exports including
  `createConnectivityStatus`, `getConnectivityBackend`, `setConnectivityBackend`,
  `createWebConnectivityBackend`, and `isConnectivityOnline` -- all deleted or moved in the
  2026-08-29 rewrite. The present review supersedes it.
- **Prior assessment (2026-07-13) is partially stale.** Its `Recommended: None` is still true (the
  two approved fixes were implemented before the rewrite and then superseded by it). The Backlog
  items still name `ConnectivityBackend` (the deleted ambient type), a cached web fallback (no
  longer in this package), and `createConnectivityReachabilityMonitor` (still valid). The assessment
  should be regenerated against this review.
- **Platform-integration shared principles (`platform-integration.md`)** state:
  "Event capabilities: signal entity with `create*` / `attach*` / `detach*` / `dispose*`." The
  connectivity package implements this exactly. However, the shared principles also prescribe
  "Command capabilities: `get*Backend` / `set*Backend`" and ambient-backend precedence, which the
  2026-08-29 charter Decision explicitly deletes for this package. The per-package charter overrides
  the suite-wide principle, so this is not a contradiction, but the platform-integration doc has not
  absorbed the precedent. If the explicit-Host-witness model spreads to other platform packages, the
  shared principles document should be updated. Flagged as a candidate revision.
- **Shared decision: signal opt-in convention.** The shared principles state: "Use `enable*Signals`
  gates -- do not eagerly allocate signals in `create*` functions." `createConnectivity()` eagerly
  allocates all five signals. However, the `Connectivity` entity exists solely to carry those five
  signals -- it has no data fields and no purpose without them. The `enable*Signals` pattern is
  designed for entities that have a primary identity apart from signals (display objects, etc.),
  where signal allocation is optional cost. For an entity that IS its signals, the pattern does not
  apply. The charter is silent on this, and the shared principle does not carve out this case.
  Flagged as a candidate open direction for the charter to settle.

## Candidate open directions

- **Reachability monitor ownership + shape** (charter Open direction 1) -- the single biggest
  maturity step; this or the next review cycle should resolve it.
- **Captive-portal field on `ConnectivityReachability`** -- pairs with the monitor design.
- **Fallback routing policy for probe-less native backends** (charter Open direction 2) -- now that
  the connectivity package holds no web fallback, the question is whether a host lacking
  `reachability` should fail at compile time (type narrowing) or at runtime (sentinel).
- **Whether the `_subscriptions` WeakMap should migrate to a runtime slot** -- minor, but would
  eliminate the only module-scoped mutable state.
- **Whether `createConnectivity` eagerly allocating signals is the settled exception to the
  `enable*Signals` convention**, or whether a zero-signal `createConnectivity` +
  `enableConnectivitySignals` split is wanted for parity.
- **Whether the explicit-Host-witness model (replacing `get*Backend`/`set*Backend`) is a
  connectivity-only decision or a precedent the platform-integration shared principles should
  absorb.** The 2026-08-29 charter Decision scopes it to this package; the shared doc still
  prescribes the ambient pattern.
