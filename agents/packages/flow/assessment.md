---
package: '@flighthq/flow'
updated: 2026-07-13
basedOn: ./review.md
---

# flow — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **Reentrancy characterization tests** — pin down (with tests) what happens today when a lifecycle callback pushes/pops/replaces mid-transition and when `onUpdate` mutates the stack mid-walk. Observation only: documenting current behavior is safe; *changing* it is the reentrancy-policy fork parked below.
2. **`enableFlowGuards`** — guard module warning on a transition issued from inside another transition's callbacks, and on pushing a state object already present on the stack. Diagnostics-inversion work over `@flighthq/log`; no production cost.
3. **Test deepening for lifecycle pairing** — assert full callback *order* traces (not just call counts) across push-over-push, replace-on-empty, and clear of a mixed `updateBelow`/`renderBelow` stack, mirroring the documented pairings in each function comment.

## Backlog

Parked, with why:

- **Reentrancy policy (immediate vs deferred transitions)** — the one real semantic hole; a charter ruling, not a sweep. Surface to Open directions.
- **Transition signals (`enableFlowStackSignals`)** — charter Open direction 1; awaits direction on the event vocabulary.
- **Async transitions (loading gates)** — charter Open direction 2; cross-package composition with `@flighthq/assets`/`@flighthq/loader`.
- **Transition effects (cross-fade/slide)** — charter Open direction 3; rendering-layer follow-on, out of this package's dependency envelope.
- **Named unwind (`pop`-to-name)** — `name` is currently documented as debug-only; promoting it to a navigation key is an API-scope decision.
- **Clock-composition documentation/example** — depends on the SDK-wide clock consumer-adoption sweep; better done alongside it.

## Approved

None.
