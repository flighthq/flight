---
id: network
title: '@flighthq/network'
type: depth
target: network
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/network.md
  - tools/agents/docs/reviews/depth/network.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 78/100. A complete, correctly-shaped connectivity-event cell (entity quartet, backend seam, edge/level signals, sentinels, SSR guards) missing only a handful of NetInfo-canonical fields and a reachability story.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The first genuinely-useful upgrade: complete the `NetworkStatus` payload so developers can branch on the fields every connectivity library exposes. All additive, all cheap, no new public functions beyond accessors.

- **`@flighthq/types` — extend `NetworkStatus`** (header layer first):
  - `saveData: boolean` — Network Information API `connection.saveData`; the canonical "user/OS asked to conserve data" flag apps branch on to defer large downloads.
  - `rtt: number` — `connection.rtt` in ms, `-1` sentinel when unreported. Completes the link-quality pair with the existing `downlink`.
  - `metered: boolean` — distinct from `saveData`: "is this a metered connection." Map from `saveData` plus `type === 'cellular'` heuristics on web; native backends report it directly. The field developers actually want for "should I download on this connection."
- **`createNetworkStatus()`** — initialize the new fields to their zero/sentinel values (`saveData: false`, `rtt: -1`, `metered: false`).
- **`createWebNetworkBackend().getStatus`** — read `connection.rtt`, `connection.saveData` into the new fields; derive `metered`.
- **Convenience accessors** (free functions, full type word, `get*`/`is*`):
  - `isNetworkMetered(): boolean` — convenience over `getNetworkStatus`, mirroring `isNetworkOnline`.
  - `isNetworkSaveDataEnabled(): boolean` — direct read of the save-data flag.
- **Test coverage** for the new fields in `network.test.ts`: web backend mapping (present, absent → sentinels), `metered` derivation, and the new accessors.

Effort: small (half a day). One `@flighthq/types` change, mechanical backend wiring, three accessors.

### Silver

Competitive and solid: match a well-regarded connectivity library — full NetInfo field surface, the reachability correctness story, and richer signals.

- **`@flighthq/types` — finish the NetInfo field surface on `NetworkStatus`**:
  - `downlinkMax: number` — max plausible downlink for the underlying tech (NetInfo-canonical), `-1` sentinel.
  - Widen `NetworkConnectionType` to the full Capacitor/NetInfo set: add `'wimax'`, `'vpn'`, `'other'` (keep `'none'`/`'unknown'`). String identifiers, open contract.
- **Reachability probe** — the single biggest correctness caveat (`navigator.onLine` reports an _interface_, not _internet_). Add a probe distinct from interface state:
  - `@flighthq/types`: `NetworkReachabilityBackend` seam (or fold a `probe(options, out)` method into `NetworkBackend`) and a `NetworkReachability` result type (`{ reachable: boolean; latency: number }`, `latency` ms / `-1`).
  - `probeNetworkReachability(options): Promise<NetworkReachability>` — HEAD/`fetch` against a configurable host with timeout; returns a sentinel (`reachable: false`, `latency: -1`) on failure rather than throwing.
  - `NetworkReachabilityOptions` (`Readonly`): `url`, `timeout`, optional `signal` for cancellation.
  - Web backend implements it over `fetch` + `AbortController`; honors SSR/jsdom guards (returns sentinel when `fetch` absent).
- **Richer signals** (still via the entity, no new `enable*` group needed — the entity _is_ the opt-in):
  - `onConnectionTypeChange(type)` — edge-triggered on `type` transitions (wifi→cellular), distinct from level `onChange`.
  - `onMeteredChange(metered)` — edge-triggered metered transitions, for apps that pause/resume transfers.
  - `onReachabilityChange(reachable)` — only meaningful if a reachability watch is started; gate behind an explicit `watchNetworkReachability(net, options)` / `unwatchNetworkReachability(net)` pair so the polling cost is opt-in.
- **Status diff helper** — `hasNetworkStatusChanged(a, b): boolean` (free function, alias-safe read) so consumers and the attach loop can cheaply detect meaningful change without per-field comparison at the callsite.
- **Cross-backend consistency tests** — a shared status-shape conformance test the web backend and any native backend both satisfy (every field populated or at its documented sentinel).

Effort: medium (2–3 days). The reachability seam is the substantive design item (see Sequencing); the field/signal additions are mechanical.

### Gold

Authoritative / AAA: the canonical connectivity-reporting reference. Exhaustive fields, real native backends, performance, full edge handling, docs, and 1:1 Rust parity.

- **Real native backends** (the "-formats"-equivalent here is host adapters, not parsers):
  - `@flighthq/host-electron` — implement `NetworkBackend` over `net.online` + `powerMonitor`/system network change events, plumbed through `registerElectronBackends`. The first in-box non-web backend, proving the seam beyond web.
  - Document the path for `host-capacitor` (over `@capacitor/network`) for the mobile metered/type surface, where the web Network Information API is unavailable or partial.
- **Reachability maturity**:
  - Continuous reachability monitor with backoff: `createNetworkReachabilityMonitor(options)` / `attach*` / `detach*` / `dispose*` (a sub-entity following the event-capability quartet), debouncing flapping interfaces and exponential-backoff on repeated failure.
  - Multiple-host quorum probing (`urls: Readonly<string[]>`, reachable if N succeed) to avoid single-endpoint false negatives.
  - Distinguish _interface online_ from _internet reachable_ from _captive portal_ (HEAD returns 200 vs redirect/204 mismatch) — `NetworkReachability.captivePortal: boolean`.
- **Bandwidth/quality estimation** beyond the raw NetInfo passthrough: a rolling `estimateNetworkQuality(out)` deriving an `effectiveType`-style class from observed probe latency/throughput when the host does not report `downlink`/`rtt`, so quality reporting works on backends lacking the Network Information API (Firefox/Safari, most native shells).
- **Exhaustive edge handling & tests**: `out`-param aliasing tests for every status function; subscription idempotency under rapid attach/detach; multiple `Network` entities sharing one backend; backend swap while attached (re-subscribe); SSR/jsdom no-op paths; reachability timeout/abort/network-error sentinels. Bring colocated coverage to every exported function (`npm run exports:check` clean) plus a root API/integration test for the full attach→change→signal flow across the public SDK import path.
- **Docs**: a package-level note documenting the `navigator.onLine` "interface, not internet" caveat, when to use `online` vs a reachability probe, and the metered/save-data decision matrix.
- **Rust parity — `flighthq-network` crate**:
  - Mirror types in `flighthq-types` (`NetworkStatus`, `NetworkConnectionType`, `NetworkBackend` trait, reachability types), snake_case, `&mut` out-params, alias-safe.
  - Native default backend gated behind the `native` cargo feature (per the host-layer rule: Rust's ambient default is native/std) — read OS connectivity (e.g. via a platform crate or `if-addrs`/netlink/SCNetworkReachability) so the crate works with no host.
  - `host-web` (wasm) fills the web backend over the same Network Information API + `online`/`offline` events; reachability over `fetch`.
  - Record the crate in the conformance map; conformance test that web (TS) and wasm (Rust) report identical status shape against the same simulated `navigator` state.

Effort: large (1–2 weeks across TS + Rust + two host backends). The native backends and Rust crate are the bulk; reachability maturity is the rest.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze first — `@flighthq/types` field additions, then wiring.** Define `saveData`/`rtt`/`metered` on `NetworkStatus` in the header layer before touching `network.ts` (the design rule: types first). Then `createNetworkStatus`, the web backend mapping, and the two accessors. Self-contained, no cross-package coordination. Run `npm run api network`, `npm run exports:check`, `npm run order`, `npm run fix`.
2. **Silver field/signal work** is mechanical and can follow immediately: `downlinkMax`, the `NetworkConnectionType` widening, edge signals, `hasNetworkStatusChanged`. Widening the union is a `@flighthq/types` change — confirm no exhaustive `switch` elsewhere breaks (`mapWebConnectionType` already defaults, so safe).
3. **Reachability seam (Silver) is the first real design decision — surface it before building.** Two cross-cutting questions for the user:
   - _Does reachability belong in `@flighthq/network` at all, or in a sibling cell?_ The depth review flags it as "arguably out of scope for a pure event cell." Recommendation: keep it here (it is the connectivity domain's defining correctness gap) but as an _opt-in_ watch (`watchNetworkReachability`) so the base cell stays a zero-cost status reader and the `fetch`/polling cost is never pulled into a small bundle.
   - _Is async on the seam acceptable?_ `probeNetworkReachability` returns a `Promise`. This is the first async surface in this package — confirm the `NetworkBackend` trait may carry an async method, and note the Rust-port `Send`/`!Send` async-seam caveat (keep the native seam clean, let `host-web` bridge `!Send` `fetch`/`JsFuture` internally — never contort the authoritative trait for the wasm instrument).
4. **Gold native backends depend on the host packages.** `host-electron` work is cross-package — coordinate with the `@flighthq/host-electron` owner; it slots into `registerElectronBackends` alongside the other seams. `host-capacitor` does not exist yet — surface it as a future-sibling note, do not build it autonomously.
5. **Rust crate (Gold) depends on the Bronze/Silver TS type shape being final** — port last, after the TS header has settled, so the conformance map records one stable contract. The native default backend's OS-connectivity source (netlink/SCNetworkReachability/if-addrs) is a Rust-side dependency decision to raise when starting that crate.

Cross-package / design-decision items to surface explicitly: (a) reachability ownership (here vs sibling) and its opt-in shape; (b) async on the `NetworkBackend` seam + the Rust `Send` posture; (c) `host-electron`/`host-capacitor` coordination for native backends. Everything in Bronze and the field/signal half of Silver is self-contained and can ship without those decisions.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/network` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
