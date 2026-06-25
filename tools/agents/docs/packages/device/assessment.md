---
package: '@flighthq/device'
updated: 2026-06-25
basedOn: ./review.md
---

# device — Assessment (merge gate: integration-b2824e3d8 → origin/main)

> Recommendation layer over `review.md`. The reviewed unit is the **delta** (`integration-b2824e3d8` head vs the approved `origin/main` (`eb73c3d74`) base), judged as a merge gate. Sorts findings into sweep-safe **Recommended** (within `@flighthq/device`, no cross-package coupling, no design decision) and parked **Backlog**. `Approved` is the user's verbal gate and is left empty. Design forks and cross-package items route to the charter's Open directions, not into Recommended.
>
> **Context that dominates this assessment:** the delta does not compile (its `@flighthq/types` header was never landed) and it depends on a structurally-rejected package. Those are merge blockers handled in the dispatch brief (`outgoing/integration/device.md`), not sweep-safe recommendations. The items below are what remains _after_ the blockers are resolved.

## Recommended

Sweep-safe: each lands entirely inside `@flighthq/device`, breaks nothing, and decides nothing the charter has not. These presume the merge blockers are fixed first (they are not Recommended items — see Backlog/brief).

- **Add a package README.** A human-readable field/unit/sentinel table over every `DeviceInfo` / `DeviceCapabilities` / `DeviceDisplayMetrics` field — its unit, its sentinel, and what the web backend can vs. cannot resolve. Pure documentation of the surface the delta introduces; no code change. — review.md, "What is genuinely good".

That is the whole sweep-safe set. The runtime is well-built; the open work is the packaging-edge fork and the missing header — none of which is within-package, decision-free, sweep-safe work.

## Backlog

Parked — each is a merge blocker, cross-package, larger-scope, or waiting on an Open direction. Reason per item.

- **Land the `@flighthq/types/src/Device.ts` header expansion (MERGE BLOCKER).** Add `DeviceCapabilities`, `DeviceDisplayMetrics`, the expanded `DeviceInfo` (arch/cpuCores/gpuVendor/formFactor/osBuild/supportedAbis/totalMemory/…), the expanded `DeviceBackend` (`getCapabilities`/`getDisplayMetrics`/`getId`), and the seven `DeviceFormFactor*` string-kind constants. **Parked here, escalated to the brief:** this is the missing half of the change and is required for the delta to compile — it is a `@flighthq/types` edit, outside this package, and must be coordinated as part of the integration, not swept. — review.md#blocking-findings (1).

- **Resolve the `device-formats`/`platform-formats` → `useragent` collapse (MERGE BLOCKER / structural fork).** The register and `structural-forks.md:22-23,57` reject both `-formats` cells (no plurality, misnamed `-formats` on a UA string, no upstream-library oracle). The delta makes `device` depend on `@flighthq/device-formats` (`package.json:30`). Blessed resolution: a shared `useragent` value-leaf. **Parked + routed:** cross-package structural decision that removes a package the runtime depends on; needs the user's explicit bless before execution, and is the opposite of sweep-safe. — review.md#blocking-findings (2).

- **Collapse the duplicated desktop-UA regex.** `detectDesktopUa` (`device.ts:285-287`) re-implements the desktop branch of `parseUserAgentFormFactor` (`device-formats/userAgentParse.ts:40`). **Parked:** the natural fix lands inside the `useragent` collapse above (one regex, one home); doing it standalone now would just move duplication, so it waits on that fork. — review.md#non-blocking (3).

- **Declare `refresh?(): void` on `DeviceBackend`.** Removes the `as unknown as { refresh?: () => void }` cast in `refreshDeviceInfo` (`device.ts:266-270`). **Parked:** a `@flighthq/types` edit that rides along with the header expansion above; not a standalone within-package change. — review.md#non-blocking (4).

- **`getDeviceIdAsync(): Promise<string>` native-keystore seam.** **Parked:** a real gap only once a native host lands; the sync `getId` covers web today. — review.md (carried).

- **`flighthq-device` Rust crate.** A value-typed mixable leaf. **Parked:** Rust-worktree / conformance track; and it should mirror whatever shape the `useragent` collapse settles, so it waits on that fork. — review.md#rust-mirror.

- **`getId` storage seam** (inject `@flighthq/storage` vs direct `localStorage`); **predicate-convenience helpers** (`isDeviceTablet` etc.); **`device` ↔ `screen` boundary ruling**; **`installSource` home**. **Parked + routed to Open directions:** each is a cross-package or taste decision, unchanged by this delta. — charter Open directions 2-5.

## Routed to the charter's Open directions

Not assessment items — flagged for the charter pass (this assessment does not edit the charter). These restate the draft charter's Open directions that this merge gate makes load-bearing:

1. **The `device-formats`/`platform-formats` → `useragent` collapse** — the load-bearing fork; bless or not. This delta forces it: it cannot merge cleanly while depending on the rejected cell.
2. **`device` ↔ `screen` boundary** — one-line ruling.
3. **`getId` durability seam** — `@flighthq/storage` vs direct `localStorage`.
4. **`installSource` home** — `@flighthq/app` vs `device`.
5. **Predicate-convenience policy** — `isDeviceTablet`-style helpers vs raw `formFactor` compares.
6. **What "Gold" means for a host-identity leaf** — so a future session does not re-spawn a rejected neighbor and self-score it Gold on within-package completeness alone (the prior 91/100 worker claim, and the prior 78/100 review, both missed that the header was never landed).

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here until the user confirms._
