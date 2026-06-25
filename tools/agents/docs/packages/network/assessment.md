---
package: '@flighthq/network'
updated: 2026-06-25
basedOn: ./review.md
---

# network — Assessment (merge gate: integration-b2824e3d8)

The review (partial, 45/100, REVISE) finds the delta's _design_ canonical but the bundled _artifact_ broken: the `network.ts` runtime change depends on `@flighthq/types/src/Network.ts` additions that the integration HEAD does not carry, so it does not typecheck. The only sweep-safe work this assessment can recommend is the one that restores compilation; everything else stays parked exactly as the prior (blessed-direction) assessment parked it, because the design questions are unchanged — they were simply never the problem. The problem is a dropped types hunk.

## Recommended

_Sweep-safe: within `@flighthq/network` (+ its owned `@flighthq/types/src/Network.ts` header), no cross-package coupling, no breaking change, no open design decision._

- **Restore the `@flighthq/types/src/Network.ts` header to match the runtime.** This is the merge-blocker fix and it is in-package by the types-first rule (a package owns its header file in `@flighthq/types`). Add the type surface the runtime already references — widen `NetworkConnectionType` to the 9-member set (`+wimax/vpn/other`); add `downlinkMax`/`rtt`/`saveData`/`metered` to `NetworkStatus`; add `onConnectionTypeChange`/`onMeteredChange` to `Network`; add optional `probeReachability` to `NetworkBackend`; add `NetworkReachability` and `NetworkReachabilityOptions`. Grounded in review.md › "The blocker" (every missing symbol is enumerated with a `b2824e3d8:` citation). Without this, the runtime and tests do not compile. _Alternatively_ — if the intent was to NOT ship the new type surface — revert `network.ts`/`network.test.ts` to the base shape; but the design is good and the charter wants it, so restoring the header is the right direction.

- **Re-mark `status.md`'s as-claimed block unverified.** Its `Types (packages/types/src/Network.ts)` section claims a change absent from this bundle's HEAD. A status pass should annotate that the type changes did not land in integration-b2824e3d8, so the continuity log stops asserting a false-shipped state. (review.md › Contract & docs fit.)

## Backlog

_Parked: cross-package coordination, larger scope, a doc the user gates, or waiting on an Open direction. Each carries its reason. Unchanged from the prior blessed assessment — the design backlog was never the gate._

- **In-box native backend (`host-electron` `NetworkBackend` over `net.online`/`powerMonitor`).** Cross-package — lives in `@flighthq/host-electron` via `registerElectronBackends`, not this cell. The first non-web backend. (review.md › Design assessment; charter Open direction 7.)

- **`host-capacitor` mobile backend (over `@capacitor/network`).** Cross-package and the package does not yet exist. Future sibling; do not build autonomously. (charter Open direction 7.)

- **Continuous reachability monitor — `createNetworkReachabilityMonitor` (backoff, multi-URL quorum, captive-portal detection).** Gated on charter Open direction 1 (reachability ownership/shape): stays in `@flighthq/network` as an opt-in sub-entity vs. a sibling `@flighthq/network-reachability`. First async sub-entity in the domain. Not sweep-safe until the charter rules. (review.md › Secondary observations; charter Open direction 1.)

- **`estimateNetworkQuality(out)` — derive an `effectiveType`-style class from observed probe latency on hosts lacking NetInfo.** Within-package, but valuable only once a non-web backend feeds it; parked behind the native-backend track. (charter Open direction 8.)

- **Rust crate `flighthq-network`.** Cross-worktree; deferred until the TS type shape settles — which, note, this bundle did **not** settle (the types hunk is missing). Greenlight only after the header above is restored and stable. (review.md › The blocker; charter Open direction 9.)

- **Package Map one-clause widening** ("…signals, **link-quality fields, and a reachability probe**") in `tools/agents/docs/index.md`. User-gated doc change outside this package's source. (charter Open direction 10.)

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user names items or sweeps them in. Empty until then._

## Notes for the charter's Open directions

_Design forks and cross-package questions surfaced for the charter to settle (noted here, not edited into the charter). The integration-b2824e3d8 review did not move any of these — it only surfaced the dropped-types blocker, which is mechanical, not a direction question._

1. **Reachability ownership and shape** — continuous monitor in `@flighthq/network` (opt-in sub-entity) vs. a sibling `@flighthq/network-reachability`. (charter Open direction 1.)
2. **Async on the `NetworkBackend` seam** — `probeReachability` is the first async surface; confirm the trait may carry async and record the Rust `Send`/`!Send` posture. The header restore (Recommended) is what makes this trait method real — settle the async posture alongside it. (charter Open direction 2.)
3. **Fallback routing in `probeNetworkReachability`** (fork D seam) — when a native backend lacks `probeReachability`, the fallback silently probes over the web `fetch` path and allocates a fresh web backend per call (`b2824e3d8:head/packages/network/src/network.ts:193`). Rule it: web-fetch fallback always vs. sentinel-when-backend-lacks-probe. (charter Open direction 3.)
4. **`mapWebConnectionType` closed switch (fork B)** — confirmed correct to keep closed (web-private string normalizer, `default → 'unknown'`). No registry needed. (charter Open direction 4.)
5. **Scope boundary vs. `power`/`lifecycle`/`device`** — state where metered/save-data ends and a `power` battery-driven data-saver concern begins. (charter Open direction 5.)
