---
package: '@flighthq/signals'
updated: 2026-07-02
basedOn: ./review.md
---

# signals — Assessment

Sorted from `review.md` (solid, 90/100) and the direction session (2026-07-02). Four Decisions blessed. Two items approved for immediate cleanup.

## Recommended

Strictly sweep-safe: within `@flighthq/signals`, no cross-package coupling, no open design decision.

- **Delete `disconnectAllSignals` alias.** `slot.ts` — zero-caller `@deprecated` shim for the rename to `disconnectAllSlots`. Pre-release policy mandates deletion (Decision #4).
- **Delete `connectSignalAtRate` alias.** `throttle.ts` — zero-caller `@deprecated` shim for the rename to `connectSignalAtFrameRate`. Same policy. Delete the alias, its export, and the alias-only test in `throttle.test.ts`.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Dispatch-during-dispatch safety (tombstone discipline).** The `makeDispatch` forward loop splices `once` slots and `disconnectSignal` splices during dispatch — both can skip slots if a callback disconnects before the cursor or re-enters the same signal. The fix is a `depth` counter with tombstone-on-remove (no allocation, O(1) remove). _Parked:_ user wants to review the original implementation and think about performance implications. Charter Open direction #2.
- **Nested re-entrant emit test.** Add a test that emits the same signal from within a slot. _Parked:_ couples with the tombstone decision above — the test would fail against the current splice-based path if the hazard case is exercised. Land together.
- **Throttle/debounce home.** May belong in a unified `time` package with pause/rewind/speed control rather than on the signal primitive. _Parked:_ charter Open direction #1 — needs design thought.
- **Move `SignalThrottleOptions` to `@flighthq/types`.** Minor contract drift. _Parked:_ couples with the throttle home question.
- **Dense / slotmap storage.** Replace parallel arrays with swap-remove + tombstone or a slotmap free list. _Parked:_ follows the tombstone decision (Open direction #3).
- **Connection handles, pause/resume, scopes.** The builder pass claimed these but they are not in the source tree. If desired, they are a separate feature addition — not a sweep item.
- **Rust crate conformance.** Downstream conformance debt. Separate workstream.

## Approved

- [2026-07-02 · picked "hard rename, we're greenfield"] Delete `disconnectAllSignals` alias — charter Decision #4
- [2026-07-02 · picked] Delete `connectSignalAtRate` alias — charter Decision #4
