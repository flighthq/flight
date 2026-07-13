---
package: '@flighthq/power'
updated: 2026-07-13
basedOn: ./review.md
---

# power — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Move `_wakeLockSentinel` into the web backend closure** — the wake-lock sentinel is module-level state shared by every `createWebPowerBackend()` instance (`power.ts:369`), so two backend instances alias one lock slot and `isKeepAwakeActive()` reports across instances. Hoist it into the `createWebPowerBackend` closure alongside the battery caches; behavior under the singleton `getPowerBackend` path is unchanged.
2. **Trim the vacuous alias-safety comment in `getStatus`** — `power.ts:136` claims "out may be the same object as an input" but `getStatus(out)` reads only closure primitives; no object input exists to alias. Reduce the comment to match reality (carried from the 2026-06-25 review, still present).

## Approved

1. **Add `enablePowerSignals` opt-in gate** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- Idle capability probe / skip-the-timer-on-web — folds into the charter's undecided poll-vs-push Open direction; not sweep-safe until that fork is ruled.
- Payload on `onIdleStateChange` (carry the new `PowerIdleState`) — signal-signature change touching `@flighthq/types`; small but a design call (symmetry with `onChange`), route through direction.
- Thermal/idle seam symmetry — charter Open direction, undecided.
- Rust `flighthq-power` conformance entries (idle-poller omission, required `mode` parameter) — cross-tree.
