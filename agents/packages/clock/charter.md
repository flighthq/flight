---
package: '@flighthq/clock'
crate: flighthq-clock
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clock — Charter

## What it is

`@flighthq/clock` is the **shared time primitive** for the SDK. A `Clock` entity with hierarchical clocking — child clocks inherit parent scale — providing pause, resume, speed, and time-step sourcing for any time-driven system. Tween, timeline, spritesheet player, and signal throttle/debounce all consume it.

Blessed as a new package during the tween direction session (2026-07-02). Referenced as a dependency by tween, spritesheet, and timeline charters. Designed in the direction session of 2026-07-09.

## North star

One `Clock` entity, driven by whoever owns the frame loop (`@flighthq/application`), that turns a real per-frame delta into **scaled, pausable, hierarchical** time that any time-driven system reads instead of raw `deltaTime`. Scale and pause compose down a tree: pause or slow a parent and its whole subtree follows. The primitive is deliberately tiny and dependency-light so it can sit under tween, timeline, spritesheet, and signals without coupling any of them to each other.

## Boundaries

- **Driven, never driving.** Clock does not own the frame loop, `requestAnimationFrame`, fixed-timestep accumulation, or FPS metrics — those are `@flighthq/application`. The loop calls `advanceClock(root, dtSeconds)`; clock only scales and distributes that delta.
- **Time only.** Clock stores scaled `deltaTime` + accumulated `elapsed` and the scale/pause/hierarchy that produce them. It does not own tween progress, timeline frames, or seeking — consumers seek their own state against clock-sourced time.
- **No high-level-consumer knowledge.** Clock never imports tween, timeline, spritesheet, or application. It depends only on the foundational `@flighthq/signals` (itself types-only) to offer an opt-in `onTick`. Throttle/debounce stay in signals, clock-free — a clock composes with them by exposing `onTick`, not by owning them.
- **Unit: seconds** (matching `application.elapsedTime` and tween's `seekTween`/stagger).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-09] Entity shape + hierarchy.** `Clock { scale, paused, deltaTime, elapsed, parent, children }`. Push model: `advanceClock(root, dtSeconds)` walks the subtree; each clock's `scaledDelta = paused ? 0 : incoming × scale`, then `elapsed += scaledDelta` and `deltaTime = scaledDelta`, recursing into children with its own scaled delta. `getClockEffectiveScale` / `isClockEffectivelyPaused` walk the ancestor chain.
  **Why:** hierarchical scale/pause composition (pause parent → subtree stops) is the whole point of the primitive; a push cascade from the loop-driven root computes it in one pass with no shared tick state.
- **[2026-07-09] Consumer read contract = plain fields.** Consumers read `clock.deltaTime` / `clock.elapsed` directly (stored data fields, like `rectangle.x`). Free functions are for mutation (`advanceClock`, `pauseClock`, `setClockScale`, …) and derived queries (`getClockEffectiveScale`, `isClockEffectivelyPaused`).
  **Why:** delta/elapsed are stored entity data, so field reads match the geometry/entity precedent and cost nothing in hot per-frame update loops.
- **[2026-07-09] Opt-in `onTick` signal; dependency direction is clock → signals.** `Clock` carries `onTick: Signal<(deltaTime: number) => void> | null`, allocated by `enableClockSignals(clock)` and emitted by `advanceClock` (guarded by the null check). Clock depends on `@flighthq/signals`, not the reverse.
  **Why (revises the initial "signals depends on clock" sketch):** `@flighthq/signals` is already `@flighthq/types`-only and already owns clock-free throttle/debounce (`connectSignalThrottled` / `…Debounced` / `connectSignalAtFrameRate`, which take a `deltaTime` through the signal). So the natural direction is clock → signals — a time entity emitting a tick over the lower-level dispatch primitive — with no cycle. Typing `onTick` as `Signal<(deltaTime: number) => void>` makes it plug straight into those rate helpers.
- **[2026-07-09] `onTick` is opt-in, not always-on.** Nullable + `enableClockSignals`, not an always-allocated/always-emitted signal.
  **Why:** the always-available tick is already the `deltaTime` field (the blessed pull contract); `onTick` is the additive push/compose layer. Clocks are many (a tree), so always-allocating a signal per clock and emitting it for clocks nobody subscribes to is multiplied waste — unlike `Application.onUpdate`, which is a singleton. Opt-in keeps a bare clock pure data + arithmetic.
- **[2026-07-09] Dependencies = `@flighthq/types` + `@flighthq/signals`.**
  **Why:** types for the `Clock`/`ClockOptions` shapes; signals for `onTick` (`createSignal`/`emitSignal`/`clearSignal`). Both are foundational (signals is itself types-only), so tween/timeline/spritesheet can still depend on clock with no cycle.

### Origin decisions (from other charters)

These are not clock-charter decisions yet — they are the decisions in other packages that blessed clock's existence and established constraints:

- **[2026-07-02 · tween charter]** `@flighthq/clock` blessed as shared time primitive. Hierarchical clocking (child clocks inherit parent scale). Tween, timeline, spritesheet player, and signal throttle/debounce all consume it.
- **[2026-07-02 · spritesheet charter]** Clock integration — spritesheet player adopts `@flighthq/clock` once it exists.
- **[2026-07-02 · timeline charter]** Clock integration — timeline adopts `@flighthq/clock` once it exists.
- **[2026-07-03 · capture charter]** The capture harness's deterministic clock pinning (fixed time-step per animation frame; capture assessment › Approved) is a natural clock consumer — design the pin so it can sit behind the clock seam once this package exists.

## Open directions

The 2026-07-09 session resolved the entity shape, hierarchy, read contract, throttle/debounce home, and dependencies (see Decisions). Remaining, downstream of the initial build:

1. **Consumer adoption.** Sequenced follow-ups in the tween / timeline / spritesheet charters: replace their raw `deltaTime` inputs with a clock-sourced step. Each is its own package task once clock ships.
2. **Capture clock-pin.** Fit the capture harness's deterministic fixed-step pin (capture charter, 2026-07-03) behind the clock seam — a fixed `advanceClock` delta per captured frame.
3. **Consumer composition with `onTick`.** Signals already ships clock-free throttle/debounce/frame-rate helpers; document/exercise composing them with `clock.onTick` (e.g. `connectSignalAtFrameRate(clock.onTick, fps, slot)`) as the canonical clock-driven-signal pattern.
