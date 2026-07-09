---
package: '@flighthq/clock'
updated: 2026-07-09
---

# clock — Status

Direction session held and package built on 2026-07-09 (see charter Decisions). First implementation shipped.

## Shape

`@flighthq/types`-only entity `Clock { scale, paused, deltaTime, elapsed, parent, children, onTick }` plus `ClockOptions`. Package `@flighthq/clock` depends on `types` + `signals`.

Functions: `createClock`, `createChildClock`, `advanceClock` (push cascade, emits opt-in `onTick`), `pauseClock`/`resumeClock`, `setClockScale`, `resetClock`, `addClockChild`/`removeClockChild`, `getClockParent`, `getClockEffectiveScale`, `isClockEffectivelyPaused`, `disposeClock`, `enableClockSignals`. Times in seconds. Reads are plain fields (`clock.deltaTime`/`elapsed`); `onTick` is opt-in via `enableClockSignals` and typed `Signal<(deltaTime: number) => void>` to compose with `connectSignalAtFrameRate`/`…Throttled`/`…Debounced`.

11 source files, colocated tests (33 tests). `packages:check` and clock tests green.

## Next

Consumer adoption is downstream, per each consumer's charter (not yet done):
- **tween / timeline / spritesheet**: replace raw `deltaTime` inputs with a clock-sourced step.
- **capture**: fit the deterministic fixed-step pin behind the clock seam.
- **signals**: document composing `clock.onTick` with the existing rate helpers as the canonical clock-driven-signal pattern.

Referenced as a dependency by: tween, spritesheet, timeline.
