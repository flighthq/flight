---
package: '@flighthq/network'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/network.md
  - reviews/maturation/depth/network.md
  - source
  - changes.patch
---

# network — Review

## Verdict

solid — 90/100. The connectivity-status event cell now carries the full Network Information API field surface, two new edge signals, a status diff helper, and a one-shot reachability probe seam — closing every Bronze item and the field/signal half of Silver from the maturation roadmap, plus the Silver reachability probe. The foundation was already canonical; this delta makes it the most complete the domain can be without native backends and the continuous-monitor design gate. Status.md's claims all verify against `67dc46d6:packages/network/src/network.ts` and the realized `dist/network.d.ts`.

## Present capabilities

Verified against the head source and the realized public surface (`dist/network.d.ts`, 15 exports).

- **Entity quartet** — `createNetwork`, `attachNetwork`, `detachNetwork`, `disposeNetwork`. The event-capability shape the suite prescribes. `attachNetwork` is idempotent (calls `detachNetwork` first), `detach`/`dispose` are safe when not attached, subscriptions held in a `WeakMap<Network, …>` so detached entities are not leaked.
- **Snapshot read + allocator** — `getNetworkStatus(out)` writes into an `out` param; `createNetworkStatus()` is its zero/sentinel allocator (all 8 fields). Convenience booleans `isNetworkOnline`, `isNetworkMetered`, `isNetworkSaveDataEnabled` over a shared `_scratch`.
- **Full NetInfo `NetworkStatus`** (in `@flighthq/types`): `online`, `type`, `downlink`, `downlinkMax`, `effectiveType`, `saveData`, `rtt`, `metered`. Sentinel discipline consistent (`-1` for unreported `downlink`/`downlinkMax`/`rtt`, `''` for `effectiveType`, `'unknown'` for `type`). `NetworkConnectionType` widened 6 → 9 (`+wimax/vpn/other`).
- **Edge + level signals** — `onChange` (level), `onOnline`/`onOffline` (edge, tracked via `wasOnline`), and two new edge signals `onConnectionTypeChange` (tracked `wasType`) and `onMeteredChange` (tracked `wasMetered`). The attach loop only fires the edge signals on an actual transition — verified by tests (`does not emit onConnectionTypeChange when type is unchanged`).
- **Backend seam** — `getNetworkBackend`/`setNetworkBackend`/`createWebNetworkBackend`, lazy web default, `null` resets to web. The web backend reads `navigator.onLine` + `connection.{type, downlink, downlinkMax, effectiveType, rtt, saveData}`, derives `metered = saveData || type === 'cellular'`, and SSR/jsdom-guards every global access (`typeof navigator/window/fetch`).
- **Reachability probe** — `probeNetworkReachability(options, out)` over an optional `NetworkBackend.probeReachability`, with a fetch-based web implementation (`HEAD`, `cache: 'no-store'`, `AbortController` + timeout, external-signal composition via `anyAbortSignal` with an `AbortSignal.any` fast-path and a composite-controller fallback). Returns a sentinel (`reachable: false`, `latency: -1`) on failure or absent `fetch` rather than throwing. Carries a doc comment on the `navigator.onLine` "interface, not internet" caveat.
- **Status diff** — `hasNetworkStatusChanged(a, b)`, field-by-field, `Readonly` params, alias-safe (same object → `false`, tested).
- **Tests** — 14 describe blocks / 32 tests, alphabetized and mirroring exports. Covers each edge signal, idempotency, sentinel allocation, web-backend sentinels in jsdom, alias-safe diff, the probe SSR sentinel and backend-delegation paths.

## Gaps

Against an authoritative connectivity-reporting library, the remaining gaps are all Gold-tier and correctly deferred (most are cross-package or a design gate):

- **No in-box native backend.** The seam is exercised only by web + fake backends; `host-electron` has no `NetworkBackend` over `net.online`/`powerMonitor` yet. Cross-package — not actionable here.
- **No continuous reachability monitor.** Only a one-shot probe exists. The roadmap's `createNetworkReachabilityMonitor` (backoff, quorum probing over multiple URLs, captive-portal detection) is unbuilt — the first async sub-entity in the domain, gated on a design decision.
- **`metered` is a web heuristic.** `saveData || type === 'cellular'` mis-classifies a cellular-tethered WiFi link and unlimited cellular plans. Documented in the field comment; only a native OS-metered flag fixes it. By-design for the web backend, not a defect.
- **No bandwidth/quality estimation.** `estimateNetworkQuality` (derive an `effectiveType`-style class from observed probe latency on hosts lacking NetInfo — Firefox/Safari/native shells) is absent. Low priority until native backends exist.
- **No Rust crate.** `flighthq-network` is unbuilt; `crate: flighthq-network` is declared in the charter but no `crates/` mirror exists. Correctly deferred until the TS type shape settles — which, with this delta, it now largely has.

Genuinely out of domain and correctly absent: HTTP/fetch wrappers, retries, WebSocket/SSE, DNS, proxy config. None are gaps for this cell.

## Charter contradictions

None. The charter's "What it is" (event-style connectivity cell, not a transport library) is honored exactly — every addition is connectivity status, reachability, or link-quality reporting; nothing drifts toward axios/undici territory. North star / Boundaries / Decisions are all still `TODO`, so there is little to contradict — see candidate open directions.

## Contract & docs fit

**Lives up to the contract — strongly.**

- **Types-first.** Every cross-package type (`NetworkStatus`, `NetworkConnectionType`, `NetworkBackend`, `NetworkReachability`, `NetworkReachabilityOptions`, `Network`) lives in `@flighthq/types/src/Network.ts`; nothing is defined inline. The only package-local interface (`WebNetworkConnection`) is a web-DOM shim, correctly private at file bottom.
- **Full unabbreviated names.** Every export carries the `Network` type word (`getNetworkStatus`, not `getStatus`); backend-internal `getStatus`/`subscribe`/`probeReachability` are interface methods, correctly unprefixed. Booleans use `is*`/`has*`.
- **`out`-params + alias safety.** `getNetworkStatus(out)`, `createNetworkStatus` allocator, `probeNetworkReachability(options, out)`, `hasNetworkStatusChanged` reads inputs before any write.
- **Sentinels not throws.** `-1`/`''`/`false` sentinels throughout; the probe returns a sentinel on failure. No error-wrapping types.
- **Single root export** (`index.ts` → `export * from './network'`), `sideEffects: false`, module state (`_backend`, `_scratch`, `_subscriptions`) at file bottom, no top-level side effects. The status reader and the probe are separate tree-shakable free functions, so a status-only consumer never pulls the `fetch`/`AbortController` probe code.
- **`Readonly<>`** on `hasNetworkStatusChanged` params, `NetworkReachabilityOptions`, the `onChange`/`Network` signal payload. Good.

**Candidate doc/contract revisions (user's gate, not mine):**

- The Package Map line — "`@flighthq/network` (event): connectivity status and online/offline signals" — now undersells the package: it has a reachability probe and link-quality fields. A one-clause widening ("…signals, link-quality fields, and a reachability probe") would match reality.
- The maturation roadmap (`reviews/maturation/depth/network.md`) is now stale at its current-verdict line (78/100) — Bronze and the field/signal half of Silver are done. This review supersedes the prior depth review (`reviews/depth/network.md`, 78/100); the maturation doc is a roadmap, left as-is.

## Candidate open directions

The charter's North star / Boundaries / Decisions are all `TODO`; these are the questions this review had to assume past, surfaced for the charter to settle:

1. **Reachability ownership and shape.** Does the continuous monitor belong in `@flighthq/network` or a sibling `@flighthq/network-reachability`? Status.md leans "keep here as an opt-in sub-entity"; the depth review called reachability "arguably out of scope for a pure event cell." Worth a Decision — it determines whether the package stays a pure status reader or grows a polling sub-entity. (Note: the shipped one-shot probe already lives here; the open question is the _continuous monitor_, not the probe.)
2. **Async on the `NetworkBackend` seam.** `probeReachability` is the first async surface in this package. Confirm the trait may carry async, and record the Rust-port posture (native seam stays clean/sync where native is sync; `host-web` bridges `!Send` `fetch`/`JsFuture` internally — never contort the authoritative trait for the wasm instrument). A charter Decision would freeze this.
3. **Fallback routing in `probeNetworkReachability`** (structural-fork-adjacent, fork D seam): when a native backend without `probeReachability` is installed, the fallback constructs `createWebNetworkBackend()` and probes over `fetch` — silently routing a native app's probe through the web path. Acceptable as a universal default, but it means "I set a native backend" does not guarantee "my reachability uses native." Worth a deliberate ruling: web-fetch fallback always, or sentinel-when-backend-lacks-probe.
4. **`mapWebConnectionType` closed switch (fork B).** This is a closed `switch(type)` over the 9 `NetworkConnectionType` strings. It is correct to keep closed here — it is a web-backend-private string normalizer, not a user-extensible dispatch table, and it `default`s to `'unknown'` so widening the union never breaks it. No registry needed; noted only to confirm fork B was considered and the closed form is the right call.
5. **Where does scope end vs. `power`/`lifecycle`/`device`?** The suite has neighboring event cells (`power` battery/keep-awake, `lifecycle` foreground/background). The charter should state the boundary explicitly — e.g. "metered/save-data live here; battery-driven data-saver mode is a `power` concern" — so future fields land in the right cell.
