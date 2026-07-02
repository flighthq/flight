---
package: '@flighthq/clock'
crate: flighthq-clock
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clock — Charter

## What it is

`@flighthq/clock` is the **shared time primitive** for the SDK. A `Clock` entity with hierarchical clocking — child clocks inherit parent scale — providing pause, resume, speed, and time-step sourcing for any time-driven system. Tween, timeline, spritesheet player, and signal throttle/debounce all consume it.

Blessed as a new package during the tween direction session (2026-07-02). Referenced as a dependency by tween, spritesheet, and timeline charters.

_(Needs a full direction session to design the entity shape, hierarchical model, and consumer contract.)_

## North star

_TODO — needs direction session._

## Boundaries

_TODO — needs direction session._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from other charters)

These are not clock-charter decisions yet — they are the decisions in other packages that blessed clock's existence and established constraints:

- **[2026-07-02 · tween charter]** `@flighthq/clock` blessed as shared time primitive. Hierarchical clocking (child clocks inherit parent scale). Tween, timeline, spritesheet player, and signal throttle/debounce all consume it.
- **[2026-07-02 · spritesheet charter]** Clock integration — spritesheet player adopts `@flighthq/clock` once it exists.
- **[2026-07-02 · timeline charter]** Clock integration — timeline adopts `@flighthq/clock` once it exists.

## Open directions

1. **Clock entity shape.** What fields does a `Clock` have? `elapsed`, `deltaTime`, `scale`, `paused`, `parent`? What is the hierarchical model?
2. **Consumer contract.** How does a time-driven system (tween, timeline, spritesheet player) read time from a clock? Direct field access, or a `getClockDeltaTime(clock)` function?
3. **Signal throttle/debounce home.** Does clock own throttle/debounce utilities, or do they live in signals with a clock dependency?
4. **Package dependencies.** Should clock depend on anything beyond types?
