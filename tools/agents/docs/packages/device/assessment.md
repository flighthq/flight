---
package: '@flighthq/device'
updated: 2026-06-24
basedOn: ./review.md
---

# device — Assessment

> Recommendation layer over `review.md`. Sorts the review's gaps into sweep-safe **Recommended** (within `@flighthq/device`, no cross-package coupling, no design decision) and parked **Backlog**. `Approved` is the user's verbal gate and is left empty. Design forks and cross-package items are routed to the charter's Open directions, not into Recommended. There is no prior `reviews/maturation/depth/device.md` roadmap to absorb — this is the first assessment of the cell, so every item is grounded directly in the review.

## Recommended

Sweep-safe: each lands entirely inside `@flighthq/device`, breaks nothing, and decides nothing the charter has not.

- **Add a package README.** A human-readable field/unit/sentinel table covering every `DeviceInfo` / `DeviceCapabilities` / `DeviceDisplayMetrics` field, its unit, its sentinel, and what the web backend can vs. cannot resolve (which fields are honestly unknowable on web). Pure documentation of the already-shipped surface; no code change. — review.md#gaps ("README").

That is the whole sweep-safe set. The device _runtime_ already reads near-Gold in the review (clean backend seam, full sentinel discipline, complete `out`-param + `create*` quartet hygiene, 26 colocated tests), so there is little within-package, non-design work left — the open work is the packaging-edge fork and the native/Rust seams, all of which are parked below.

## Backlog

Parked — each is cross-package, larger-scope, or waiting on an Open direction. Reason given per item.

- **`getDeviceIdAsync(): Promise<string>` native-keystore seam.** Adds an async id path for Android Keystore / iOS Keychain. **Parked:** a real gap only once a native host lands — the sync `getId` path fully covers web today, and the status doc deferred it. Premature until a native backend exists. — review.md#gaps ("Async id seam").

- **`flighthq-device` Rust crate.** A value-typed leaf, mixable per the conformance map. **Parked:** lives in the Rust worktree / conformance track, not in this TS package; the charter front matter stamps `crate: flighthq-device` as intent but the conformance map has no crate yet. Cross-tree, larger scope. — review.md#gaps ("Rust crate").

- **Resolve the `device-formats` → `useragent` collapse.** The register (`register.md:38`, `structural-forks.md` plurality guard line 34) already **rejects** `device-formats` — blood-from-a-stone, no plurality, `-formats` misnamed on a UA string, with a now-concrete duplicate `parseUserAgentArch` export shared with `@flighthq/platform-formats`, plus an internal `detectDesktopUa` re-implementation of `parseUserAgentFormFactor`. The mandated resolution is to collapse both `-formats` packages into a shared `useragent` value-leaf. **Parked + routed:** this is a cross-package structural fork that removes a package the `device` runtime depends on — it needs the user's explicit bless before execution. Surfaced to the charter's Open directions (see below), not actioned here, and not in Recommended because it is the opposite of sweep-safe. — review.md#charter-contradictions.

- **`getId` storage seam (inject `@flighthq/storage` vs direct `localStorage`).** **Parked:** a dependency-direction design question — it touches the "device stays dependency-light" North star and id durability across backends. Cross-package coupling decision, routed to Open directions. — review.md#gaps ("`getId` storage coupling"), candidate direction 3.

- **Predicate-convenience helpers (`isDeviceTablet(info)` etc.).** **Parked:** a taste/API-shape call the charter should record once — free-function predicates vs. consumers comparing the `formFactor` string-kind directly. Design decision, routed to Open directions. — review.md#gaps, candidate direction 5.

- **`device` ↔ `screen` boundary ruling.** `DeviceDisplayMetrics` (static built-in display) vs. `@flighthq/screen` (live multi-display / work-area / orientation). **Parked:** cross-package boundary that is documented inline in `Device.ts` but never blessed in the Package Map. Needs a one-line ruling. Routed to Open directions. — review.md candidate direction 2.

- **`installSource` / `installerSource` placement.** Play Store / App Store / sideloaded provenance — a common device-library field whose natural home is likely `@flighthq/app`. **Parked:** cross-package placement decision. Routed to Open directions. — review.md candidate direction 4.

## Routed to the charter's Open directions

Not assessment items — noted here for the charter pass (this skill does not edit the charter). The charter's North star / Boundaries / Decisions are all still `TODO`, so these are the questions that turn the stub into a real charter:

1. **The `device-formats` → `useragent` collapse** (the load-bearing fork; bless or not).
2. **`device` ↔ `screen` boundary** — one-line ruling to prevent future overlap.
3. **`getId` durability seam** — inject `@flighthq/storage` vs. direct `localStorage`.
4. **`installSource` home** — confirm `@flighthq/app` vs. `device`.
5. **Predicate-convenience policy** — `isDeviceTablet`-style helpers vs. raw `formFactor` compares.
6. **What "Gold" means for a host-identity leaf** — so a future session does not re-spawn a rejected neighbor and score it Gold on within-package completeness alone.

(Two cell-hygiene flags from the review also belong to the user, not this assessment: the Package Map omits `device-formats` by intent, and a `device-formats/charter.md` was scaffolded for a rejected package — both resolve when the `useragent` collapse is executed, not by editing the Map.)

## Approved

_Frozen on the user's verbal approval only. None yet._
