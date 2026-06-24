---
package: '@flighthq/network'
updated: 2026-06-24
basedOn: ./review.md
---

# network — Assessment

The review (solid, 90/100) verifies that every Bronze item and the field/signal half of Silver — plus the Silver one-shot reachability probe — already shipped in `67dc46d6`. What remains in the maturation roadmap is the Gold tier, which is almost entirely cross-package (native backends, the Rust crate) or gated on an Open direction (the continuous monitor's ownership/shape). The package is the most complete the domain can be without native backends, so this assessment is short on in-package sweep-safe work by design: the foundation is canonical and the next steps require a direction call or another package.

## Recommended

_Sweep-safe: within `@flighthq/network`, no cross-package coupling, no breaking change, no open design decision._

- **None.** Every remaining roadmap item is parked for one of three reasons recorded under Backlog: it is cross-package (native backends, the Rust crate), it waits on an Open direction (the continuous monitor and its async/fallback posture), or it is a doc edit the user gates (the Package Map widening). There is no within-package code change that is both grounded in the review and free of a design or cross-package dependency. This is a healthy end state for the cell, not a gap in this assessment.

## Backlog

_Parked: cross-package coordination, larger scope, a doc the user gates, or waiting on an Open direction. Each carries its reason._

- **In-box native backend (`host-electron` `NetworkBackend` over `net.online`/`powerMonitor`).** Cross-package — lives in `@flighthq/host-electron` and plumbs through `registerElectronBackends`, not in this cell. The first non-web backend; proves the seam beyond web. (review.md › Gaps; roadmap › Gold.) Coordinate with the host-electron owner.

- **`host-capacitor` mobile backend (over `@capacitor/network`).** Cross-package and the package does not yet exist. Surface as a future sibling; do not build autonomously. (roadmap › Gold.)

- **Continuous reachability monitor — `createNetworkReachabilityMonitor` (backoff, multi-URL quorum, captive-portal detection).** Gated on Open direction 1 (reachability ownership/shape): does the monitor stay in `@flighthq/network` as an opt-in sub-entity or move to a sibling `@flighthq/network-reachability`? It is also the first async sub-entity in the domain. Not sweep-safe until the charter rules on ownership. (review.md › Gaps; roadmap › Gold.)

- **`estimateNetworkQuality(out)` — derive an `effectiveType`-style class from observed probe latency on hosts lacking NetInfo (Firefox/Safari/native shells).** A within-package free function, but the review marks it "low priority until native backends exist" — its value is realized only once there is a non-web backend feeding it, so it is parked behind the native-backend track rather than swept now. (review.md › Gaps; roadmap › Gold.)

- **Rust crate `flighthq-network`.** Cross-worktree; correctly deferred until the TS type shape settles (which, per the review, it now largely has). Mirror the types in `flighthq-types`, `native`-feature default backend, `host-web` wasm fill, record in the conformance map. (review.md › Gaps; roadmap › Gold.)

- **Package Map one-clause widening** ("…signals, **link-quality fields, and a reachability probe**") in `tools/agents/docs/index.md`. A doc edit outside this package's source that the review flags as the map now underselling the cell. User-gated documentation change, not a sweep-safe code item. (review.md › Contract & docs fit.)

- **Retire the seed roadmap.** `reviews/maturation/depth/network.md` is stale at its 78/100 current-verdict line — Bronze and the field/signal half of Silver are done and this assessment has absorbed it. Note for removal as one-time seed once the assessment is blessed (not an autonomous delete here). (review.md › Contract & docs fit; SKILL § Inputs.)

## Approved

_Frozen on the user's verbal approval only. Empty._

## Routed to the charter's Open directions

_Design forks and cross-package questions surfaced for the charter to settle (noted here, not edited into the charter):_

1. **Reachability ownership and shape** — continuous monitor in `@flighthq/network` (opt-in sub-entity) vs. a sibling `@flighthq/network-reachability`. Determines whether the cell stays a pure status reader or grows a polling sub-entity. (Open direction 1.)
2. **Async on the `NetworkBackend` seam** — `probeReachability` is the first async surface; confirm the trait may carry async and record the Rust `Send`/`!Send` posture (native seam clean/sync; `host-web` bridges `!Send` internally). (Open direction 2.)
3. **Fallback routing in `probeNetworkReachability`** (fork D seam) — when a native backend lacks `probeReachability`, the fallback silently probes over the web `fetch` path. Rule it deliberately: web-fetch fallback always vs. sentinel-when-backend-lacks-probe. (Open direction 3.)
4. **`mapWebConnectionType` closed switch (fork B)** — confirmed correct to keep closed (web-private string normalizer, `default`s to `'unknown'`, not a user-extensible dispatch). No registry needed; noted only to record that fork B was considered. (Open direction 4.)
5. **Scope boundary vs. `power`/`lifecycle`/`device`** — state where metered/save-data ends and a `power` battery-driven data-saver concern begins, so future fields land in the right cell. (Open direction 5.)
