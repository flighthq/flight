---
package: '@flighthq/power'
updated: 2026-08-25
basedOn: ./review.md
---

# power — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

None — all prior items verified landed 2026-08-25.

## Approved

1. **Add `enablePowerSignals` opt-in gate** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- Idle capability probe / skip-the-timer-on-web — folds into the charter's undecided poll-vs-push Open direction; not sweep-safe until that fork is ruled.
- Payload on `onIdleStateChange` (carry the new `PowerIdleState`) — signal-signature change touching `@flighthq/types`; small but a design call (symmetry with `onChange`), route through direction.
- Thermal/idle seam symmetry — charter Open direction, undecided.
- Rust `flighthq-power` conformance entries (idle-poller omission, required `mode` parameter) — cross-tree.
