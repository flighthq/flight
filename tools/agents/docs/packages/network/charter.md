---
package: '@flighthq/network'
crate: flighthq-network
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# network — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/network` is the **connectivity-status event cell** of the platform-integration suite: it reports whether the application is online, what kind of link it is on, and how good that link is — plus an opt-in one-shot reachability probe. It is an _event-style platform capability_ (the Package Map lists it under "Platform Integration Suite … `@flighthq/network` (event): connectivity status and online/offline signals"), modeled on the connectivity-reporting surface of a mature cross-platform shell — Electron `net.online`/`powerMonitor`, Capacitor `@capacitor/network`, Cordova `network-information`, the browser Network Information API.

It is **not** an HTTP/fetch/socket transport library: no request wrappers, retries, WebSocket/SSE, DNS, or proxy config. The domain bar is connectivity reporting, not axios/undici.

Where it ends and neighbors begin (proposed boundaries below): `network` reports the _link_ — online/offline, connection type, metered/save-data, downlink/rtt — while `power` owns battery/charging and keep-awake, and `lifecycle` owns app foreground/background. The shipped shape is the suite's standard event quartet (`createNetwork`/`attachNetwork`/`detachNetwork`/`disposeNetwork`) over a swappable `NetworkBackend` with a lazy web default, plus a snapshot reader (`getNetworkStatus(out)`), edge/level signals, a status diff, and the reachability probe.

## North star (proposed)

_Inferred from the design + the structural forks; edit to your framing. These are proposals, not blessed principles._

1. **A reporter, not a transport.** The package exposes connectivity _facts_ (status, type, quality, reachability) and _change notifications_ — never request/socket machinery. The bar is the connectivity surface of a mature cross-platform shell, capped there deliberately.
2. **One backend seam, sentinels never throws.** Every platform difference resolves behind a single swappable `NetworkBackend`; a lazy web default means every function works on the web, and absent capabilities return sentinels (`-1`/`''`/`false`/`unreachable`) rather than throwing. "Native support" is one more backend, not a coupling.
3. **Types-first, in `@flighthq/types`.** The full shape (`NetworkStatus`, `NetworkConnectionType`, `NetworkBackend`, `NetworkReachability`, `NetworkReachabilityOptions`, `Network`) is navigable from the header layer alone; only web-DOM shims stay package-private.
4. **Tree-shakable by concern.** A status-only consumer never pulls the `fetch`/`AbortController` probe path; the reader and the probe are separate free functions. `sideEffects: false`, module state at file bottom, single root export.
5. **Out-params, alias-safe, full unabbreviated names.** `getNetworkStatus(out)`, `createNetworkStatus()` allocator, `hasNetworkStatusChanged(a, b)` reads inputs before writing; every export carries the `Network` type word and `is*`/`has*` for booleans.

## Boundaries (proposed)

**In scope (proposed):**

- Online/offline status and the full Network Information API field surface (type, downlink, downlinkMax, effectiveType, saveData, rtt, metered).
- Level + edge signals (`onChange`, `onOnline`/`onOffline`, `onConnectionTypeChange`, `onMeteredChange`).
- A snapshot reader/allocator, convenience booleans, and a field-by-field status diff.
- One-shot reachability probing over the backend seam, with a web `fetch`-based default.
- The backend seam and its web default; native backends supplied by `host-*` packages.

**Non-goals (proposed):**

- HTTP/fetch wrappers, retries, request orchestration; WebSocket/SSE; DNS; proxy configuration. (Correctly absent today; not gaps for this cell.)
- Battery-driven data-saver / power state (a `power` concern) and app foreground/background (a `lifecycle` concern) — see Open direction 5.
- A continuous reachability monitor is **undecided**, not in/out — see Open direction 1.

## Decisions

None blessed yet.

## Open directions

Every candidate question from `review.md`, plus the structural forks that touch this cell. These are where the draft asks rather than assumes; settle them to turn this into a real charter.

1. **Reachability ownership and shape (the continuous monitor).** The shipped _one-shot_ probe lives here. The open question is the _continuous monitor_ (`createNetworkReachabilityMonitor` — backoff, quorum probing over multiple URLs, captive-portal detection): does it belong in `@flighthq/network` as an opt-in sub-entity (status.md's lean), or in a sibling `@flighthq/network-reachability` (the depth review called continuous reachability "arguably out of scope for a pure event cell")? This determines whether the package stays a pure status reader or grows the domain's first async polling sub-entity. _(Touches fork A — source-data/simulation vs. participation — and fork E — bedrock / does a real sub-subject exist.)_
2. **Async on the `NetworkBackend` seam.** `probeReachability` is the first async surface in the package. Confirm the trait may carry async, and freeze the Rust-port posture: native seam stays clean/sync where native is sync; `host-web` bridges `!Send` `fetch`/`JsFuture` internally — never contort the authoritative trait for the wasm instrument. _(Touches fork D — runtime backend seam — and the rust/index async/`Send` note.)_
3. **Fallback routing in `probeNetworkReachability`.** When a native backend lacking `probeReachability` is installed, the fallback builds `createWebNetworkBackend()` and probes over `fetch` — silently routing a native app's probe through the web path. Acceptable as a universal default, but "I set a native backend" then does not guarantee "my reachability uses native." Rule it deliberately: web-fetch fallback always, or sentinel-when-backend-lacks-probe? _(Fork D, seam semantics.)_
4. **`mapWebConnectionType` — closed switch vs. open registry (fork B).** A closed `switch(type)` over the 9 `NetworkConnectionType` strings, `default`ing to `'unknown'`. Reviewer's read: correctly closed — a web-backend-private string normalizer, not a user-extensible dispatch table, so widening the union never breaks it; no registry needed. Recorded here only to confirm fork B was considered and the closed form is the right call; flag if you disagree.
5. **Where scope ends vs. `power` / `lifecycle` / `device`.** The suite has neighboring event cells. State the boundary explicitly so future fields land in the right cell — e.g. "metered/save-data live in `network`; battery-driven data-saver mode is a `power` concern; foreground/background is `lifecycle`." _(Boundary clarification feeding the Boundaries section above.)_
6. **`metered` web heuristic.** Today `metered = saveData || type === 'cellular'`, which mis-classifies cellular-tethered WiFi and unlimited cellular plans. By-design for the web backend (documented in the field comment); only a native OS-metered flag fixes it. Decision needed only if you want a different web-default policy or to require the native flag once host backends exist.
7. **Native `NetworkBackend` (cross-package).** No in-box native backend yet; `host-electron` has no `NetworkBackend` over `net.online`/`powerMonitor`. Gold-tier, cross-package — surfaced here so the charter records the intended home (the `host-*` packages) rather than `network` itself.
8. **Bandwidth/quality estimation.** `estimateNetworkQuality` (derive an `effectiveType`-style class from observed probe latency on hosts lacking NetInfo — Firefox/Safari/native shells) is absent. Low priority until native backends exist; decide whether it is in scope for this cell or rides alongside the reachability monitor of direction 1.
9. **Rust crate.** `crate: flighthq-network` is declared but `crates/flighthq-network` is unbuilt — correctly deferred until the TS type shape settles (which, with this delta, it largely has). Decide when to greenlight the port.
10. **Doc revision the review surfaced (your gate).** The Package Map line — "connectivity status and online/offline signals" — now undersells the package (it also has link-quality fields and a reachability probe). A one-clause widening ("…signals, link-quality fields, and a reachability probe") would match reality. Bless or decline.
