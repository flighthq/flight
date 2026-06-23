---
id: clock
title: '@flighthq/clock'
type: new-package
target: clock
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/clock.md
  - tools/agents/docs/reviews/breadth/animation-motion.md
depends_on: []
updated: 2026-06-23
---

## Summary

A shared, scalable, pausable animation clock / time domain so tween, timeline, spritesheet, and particles advance under one scrubbable, time-scaled root — global slow-motion, pause, and seek across every motion subsystem at once.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable shared clock: one scalable, pausable time domain that fans a single scaled delta out to whatever motion managers the caller registers. This alone delivers the headline value — global pause and slow-motion across all subsystems.

- **Types in `@flighthq/types`:**
  - `Clock` — entity: `{ scale: number; paused: boolean; elapsedSeconds: number; deltaSeconds: number; rawDeltaSeconds: number; frame: number }`. `elapsedSeconds` is scaled accumulated time (the seekable position); `deltaSeconds` is the last scaled step actually delivered; `frame` is an integer tick counter.
  - `ClockRuntime` — opaque paired runtime holding the subscriber list and (later) child clocks; entities stay lean per the entity/runtime split.
  - `ClockSubscriber` — `(deltaSeconds: number, clock: Readonly<Clock>) => void`, the per-frame callback shape an `update*` adapter conforms to.
  - `ClockOptions` — `{ scale: number; paused: boolean; maxDeltaSeconds: number }` (`maxDeltaSeconds` is the spike clamp — caps a stall-induced huge delta so a paused-tab resume doesn't fast-forward animations).
- **`@flighthq/clock`:**
  - `createClock(options?: Readonly<ClockOptions>): Clock` — allocates a clock + runtime with sane defaults (scale 1, not paused, `maxDeltaSeconds` ≈ 0.25).
  - `advanceClock(clock: Clock, rawDeltaSeconds: number): number` — the canonical entry point: clamps `rawDeltaSeconds` to `maxDeltaSeconds`, applies `scale`, returns 0 (and skips subscriber dispatch) when paused, otherwise accumulates `elapsedSeconds`, increments `frame`, fans the scaled delta to every subscriber, and returns the scaled delta.
  - `addClockSubscriber(clock: Clock, subscriber: ClockSubscriber): ClockSubscriber` — registers a per-frame callback; returns the same reference for removal. (Direct callback, not a signal — the hot path.)
  - `removeClockSubscriber(clock: Clock, subscriber: Readonly<ClockSubscriber>): boolean` — sentinel `false` if not registered.
  - `pauseClock(clock: Clock): void` / `resumeClock(clock: Clock): void` — toggle `paused`; `advanceClock` short-circuits while paused.
  - `setClockScale(clock: Clock, scale: number): void` — global slow-motion / fast-forward (0.5 = half speed, 2 = double; 0 freezes without flagging `paused`).
  - `getClockDeltaSeconds(clock: Readonly<Clock>): number` / `getClockElapsedSeconds(clock: Readonly<Clock>): number` — accessor pair.
  - `disposeClock(clock: Clock): void` — clears the subscriber registry so the clock and its callbacks become GC-eligible (detach-and-release → `dispose*`, not `destroy*`; there is no non-GC resource to free).
- **Effort:** small — one clamp/scale/accumulate function plus a subscriber list. The 80/20: a designer wires `addClockSubscriber(clock, (dt) => updateTweens(manager, dt))` (and one per subsystem), then `setClockScale(clock, 0.25)` or `pauseClock(clock)` slows or freezes the whole scene at once. The single biggest hole — no shared time domain — is closed here.

### Silver

Competitive with a well-regarded time-control layer (Unity `Time.timeScale` + a clock hierarchy, GSAP's global timeline, PixiJS `Ticker`): nested clocks, fixed-step accumulation, seeking, frame-rate independence, and a clean adapter set so the motion packages plug in without each caller hand-writing the bridge.

- **Types in `@flighthq/types`:**
  - Extend `Clock` with `{ minDeltaSeconds: number; parentScale: number }` — `parentScale` caches the inherited multiplier for nested clocks; `minDeltaSeconds` lets a clock throttle (skip dispatch below a threshold).
  - `ClockGroup` — a parent clock whose `scale` multiplies into its children, so a UI clock and a gameplay clock can be slowed independently or together (`pauseClock` on the parent freezes the subtree). Modeled as a `Clock` with a child list on `ClockRuntime`, not a separate entity, so the same functions operate on it.
  - `FixedStepClock` config carried as `ClockOptions.fixedDeltaSeconds: number | null` — when set, `advanceClock` accumulates and dispatches in fixed increments (the standard physics/deterministic-update pattern), surfacing leftover time for interpolation.
  - `ClockSubscriberPriority` — numeric ordering so update order is explicit (input → tween → particles → render-prep) rather than registration-order-dependent.
  - `ClockSeekMode` — `'Absolute' | 'Relative'` string `*Kind`s for `seekClock`.
- **`@flighthq/clock`:**
  - `createClockGroup(parent?: Clock, options?): ClockGroup` and `addClockChild(parent: ClockGroup, child: Clock): void` / `removeClockChild(parent: ClockGroup, child: Readonly<Clock>): boolean` — nested time domains; `advanceClock` on the parent recurses, multiplying scales down the tree.
  - `getClockEffectiveScale(clock: Readonly<Clock>): number` — resolved `scale × parentScale` for inspection.
  - `seekClock(clock: Clock, seconds: number, mode: ClockSeekMode): void` — jump `elapsedSeconds` forward/back; emits one large delta to subscribers (or fixed-steps through it when `fixedDeltaSeconds` is set), enabling scrubbing across all subsystems from one call.
  - `stepClock(clock: Clock, seconds: number): void` — advance exactly `seconds` of _scaled_ time regardless of pause state (frame-stepping / debugging a frozen scene).
  - `addClockSubscriber(clock, subscriber, priority?: number)` — priority overload; dispatch walks subscribers in ascending priority, ties keep registration order.
  - `getFixedStepClockAlpha(clock: Readonly<Clock>): number` — the 0..1 interpolation factor (leftover accumulator / fixedStep) for render-time interpolation between fixed updates.
  - `setClockMaxDeltaSeconds(clock: Clock, seconds: number): void` — runtime spike-clamp adjustment.
  - **Motion adapters (small bridge functions, kept here because they only depend on the consumer's `update*` signature, not its types):**
    - `createTweenClockSubscriber(manager: TweenManager): ClockSubscriber`
    - `createSpritesheetClockSubscriber(player: SpritesheetPlayer, spritesheet: Readonly<Spritesheet>): ClockSubscriber`
    - `createTimelineClockSubscriber(timeline: Timeline): ClockSubscriber`
    - `createParticleClockSubscriber(system: ParticleSystem): ClockSubscriber`
    - Each wraps the subsystem's existing `update*` so `addClockSubscriber(clock, createTweenClockSubscriber(manager))` is the one-liner. (If importing those types here proves to couple too tightly, this set moves to a thin SDK-level wiring module — see Open design questions.)
  - **Convenience frame source (uses the optional backend):**
    - `tickClock(clock: Clock): number` — reads the monotonic time source via `ClockTimeSourceBackend`, computes the raw delta since last tick internally, and calls `advanceClock`. The lazy web backend makes this work out of the box; native registers its own.
    - `createWebClockTimeSourceBackend()` / `getClockTimeSourceBackend()` / `setClockTimeSourceBackend(backend)`.
- **Signals (opt-in):** `enableClockSignals(clock)` adds `onClockPause`, `onClockResume`, `onClockScaleChange(scale)`, `onClockSeek(seconds, mode)` — for editor/devtool panels and audio ducking that react to global slow-motion. Cost only assumed when enabled.
- **Cross-backend consistency:** time math is identical across renderers; `clock` is renderer-agnostic. The only host variance is the monotonic source, isolated behind the backend seam so the deterministic `advanceClock` path is byte-identical TS↔Rust.
- **Effort:** moderate. Nesting + scale recursion and fixed-step accumulation are the substantive pieces; seek/step/priority are bounded. This is the tier that makes global slow-motion, deterministic fixed updates, and timeline scrubbing production-usable.

### Gold

Authoritative time-control layer — exhaustive, deterministic, and instrumented. Nothing a tooling-author building a motion editor, a deterministic netcode loop, or a profiler would find missing.

- **Types in `@flighthq/types`:**
  - `ClockSchedule` / `ClockScheduledCallback` — `{ atSeconds: number; callback: (clock) => void; repeatSeconds: number; remaining: number }` for time-domain scheduling (fire at scaled-time X, every Y scaled seconds) that respects pause/scale — the correct home for "do this in N in-game seconds," which raw `setTimeout` can't honor under slow-motion.
  - `ClockSnapshot` — `{ elapsedSeconds; frame; scale; paused }` for save/restore (deterministic replay, editor undo of a scrub).
  - `ClockStats` — `{ averageRawDeltaSeconds; minRawDeltaSeconds; maxRawDeltaSeconds; droppedFrames; spikeCount }` rolling window for profiling.
  - `ClockSmoothingKind` — `'None' | 'MovingAverage' | 'Median'` string `*Kind`s for delta smoothing (jitter reduction without changing total elapsed time).
- **`@flighthq/clock`:**
  - **Time-domain scheduling:** `scheduleClockCallback(clock, atSeconds, callback, options?): ClockScheduledCallback`, `scheduleClockInterval(clock, everySeconds, callback): ClockScheduledCallback`, `cancelClockCallback(clock, scheduled): boolean`. Fired inside `advanceClock` against scaled `elapsedSeconds`, so they pause and slow with the clock — distinct from `tween`'s `createTweenTimer` (which is property-tween-shaped); these are bare time triggers any subsystem can use.
  - **Snapshot / replay:** `captureClockSnapshot(clock, out: ClockSnapshot): ClockSnapshot` (alias-safe `out`-param) and `restoreClockSnapshot(clock, snapshot: Readonly<ClockSnapshot>): void` for deterministic replay and editor scrub-undo.
  - **Determinism mode:** `createDeterministicClock(fixedDeltaSeconds): Clock` — a clock that ignores wall time entirely and only advances by `stepClock`, the canonical netcode/replay/test driver (and the basis for the Rust conformance harness).
  - **Delta smoothing & stats:** `setClockSmoothing(clock, kind, windowSize): void`, `getClockStats(clock, out: ClockStats): ClockStats`, `resetClockStats(clock): void` — jitter smoothing and a profiler-ready rolling window (dropped/spike frames).
  - **Throttling / target FPS:** `setClockTargetFrameRate(clock, fps): void` — coalesce sub-interval ticks so a clock dispatches at most `fps` times/second (battery-friendly background animation, decoupling render rate from logic rate).
  - **Hierarchy completeness:** `getClockRoot(clock): Clock`, `forEachClockChild(group, visit)`, `pauseClockTree(group)` / `resumeClockTree(group)`, `setClockTreeScale(group, scale)` — full subtree control matching the scene-graph hierarchy idioms.
  - **Edge cases:** negative scale (true reverse playback driving timeline/spritesheet backward), zero `fixedDeltaSeconds` guarded as misuse (`throw` — a programmer error, per the throw-only-on-misuse rule), and a documented contract for `advanceClock` when `rawDeltaSeconds` is negative or NaN (clamped to 0, never propagated).
- **Error handling:** all expected-failure paths return sentinels (`removeClockSubscriber` → `false`, `cancelClockCallback` → `false`, no-op when paused returns `0`); only precondition violations a correct caller can't reach throw (e.g. `fixedDeltaSeconds <= 0`, a NaN scale set explicitly).
- **Tests:** colocated `*.test.ts` per source file, covering scale/pause/clamp math, nested-scale recursion, fixed-step accumulation + alpha, seek (forward/back/with-fixed-step), reverse playback, scheduling under slow-motion, snapshot round-trip, smoothing windows, and every `out`-param function in both distinct and aliased (`out === input`) forms.
- **Rust parity:** `flighthq-clock` mirrors the full surface; `advanceClock`, fixed-step accumulation, nested scale, and `createDeterministicClock` are byte-for-byte conformance-tested against TS via the headless harness. The monotonic source is the only host-split (native `Instant` behind `native` feature; web in `host-web`); the deterministic path needs none and is the conformance reference.
- **Docs:** the time-domain model (raw vs scaled vs elapsed), the app-loop → clock → subscriber flow, the fixed-step-with-interpolation recipe, the nested-clock UI/gameplay pattern, and the scrub/seek recipe.
- **Effort:** the largest tier — scheduling, smoothing/stats, throttling, snapshot/replay, and reverse playback are each bounded but additive. Determinism mode and the conformance harness coupling are what make it "the canonical time root," not just a scaler.

## Boundaries

- **Frame source ownership stays in `@flighthq/application`.** `clock` does not own `requestAnimationFrame`, the main loop, or `startApplicationLoop`. It consumes a raw delta; it does not produce one (except the optional `tickClock` convenience over the time-source backend). Wiring the app loop to `advanceClock` is a caller/SDK concern.
- **No motion logic.** `clock` never interpolates a property, advances a frame, or emits particles. It produces scaled time and dispatches it; `updateTweens`, `updateSpritesheetPlayer`, the timeline advance, and particle stepping stay in their own packages. The adapters here are thin wrappers over those existing functions, not reimplementations.
- **No easing/curve evaluation.** Time _shaping_ into eased motion is `@flighthq/easing` + `@flighthq/tween`. `clock` only scales/clamps linear time.
- **`createTweenTimer` stays in `tween`.** Property-tween-flavored delayed callbacks remain there; `clock`'s scheduling (`scheduleClockCallback`) is bare time-trigger infrastructure, a different shape. Some overlap is acceptable; they target different ergonomics.
- **No persistence/serialization neighbor.** No `-formats` package — there is nothing to parse. A recorded time-scale track (keyframing slow-motion) belongs in `@flighthq/timeline`, not a clock neighbor.
- **No backend except the monotonic time source.** Time math is host-independent; the only swappable capability is the high-resolution clock, kept off the deterministic path.
- **Adapter coupling is provisional.** If `createTweenClockSubscriber` et al. would force `clock` to import `tween`/`spritesheet`/`timeline`/`particles` types and violate import-in-isolation, they relocate to a thin SDK-level wiring module and `clock` ships only the generic `ClockSubscriber` seam. (See Open design questions.)

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Where do the motion adapters live?** `createTweenClockSubscriber` etc. are maximally convenient in `clock`, but importing the consumer packages' types couples a leaf to four subsystems. Options: (a) keep them in `clock` importing only the `*Manager`/`*Player` types from `@flighthq/types` (acceptable if those types are header-only and carry no runtime); (b) move them to `@flighthq/sdk` as wiring convenience; (c) drop them and let callers pass a closure. Leaning (a) if the manager types are pure header types, else (c) for the package and (b) in the SDK.
- **Should `advanceClock` return the scaled delta or `void`?** Returning it lets a caller chain `advanceClock` into a manual `update*` without subscribers (matches the explicit-verbosity philosophy), at the cost of a slightly less pure command. Leaning return-the-delta.
- **Pause semantics vs `scale = 0`.** Both freeze time; `paused` is a distinct boolean so devtools/signals can distinguish "user paused" from "slow-mo to a stop." Confirm both are first-class and that `enableClockSignals` distinguishes them (`onClockPause` vs `onClockScaleChange(0)`).
- **Default `maxDeltaSeconds` spike clamp value.** 0.25s (≈ 4fps floor) is a common default, but games that genuinely want catch-up (deterministic sims) need it disable-able (`Infinity`). Confirm the default and the opt-out.
- **Fixed-step leftover delivery.** Whether `getFixedStepClockAlpha` interpolation is enough, or whether render-prep needs an explicit "interpolate-from-previous" hook on subscribers. Defer until a fixed-step consumer exists.
- **Does the Rust port need the monotonic backend seam at all,** or should native always use `Instant` and web always inject? Likely the same seam shape as TS for symmetry, but the deterministic path is the real conformance target and needs no time source.
- **Relationship to a future `@flighthq/spring`/inertia solver.** Springs are time-driven; should spring solvers consume a `Clock` directly, or stay delta-driven like everything else? Leaning delta-driven (consistent with the whole motion stack) — `clock` stays the single time root and springs are just another subscriber.

## Agent brief

> Create `@flighthq/clock` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
