---
package: '@flighthq/tween'
crate: flighthq-tween
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tween — Charter

## What it is

`@flighthq/tween` is the **property animation engine**: tweening numeric (and typed-value) properties of a target object from start to end over time, with easing, delay, repeat, yoyo, callbacks, and a multi-tween manager that advances many tweens per frame. The canonical reference set is GSAP, TweenJS, anime.js, and the Actuate/Tweener/Tweensy family. It owns single-object property animation and single-object sequencing; multi-object orchestration and MovieClip-style frame-keyed animation belong to `@flighthq/timeline`.

It consumes `@flighthq/easing` for curve shapes, `@flighthq/signals` for the callback surface, and will consume `@flighthq/clock` for time source abstraction once that package exists. It does not own the frame loop (that is `@flighthq/application`), the easing curves (that is `@flighthq/easing`), or the time primitive itself (that will be `@flighthq/clock`).

## North star

1. **A single value-interpolator seam.** Every value type (numeric, color, vector, unit, array) is a registered adapter on an open `TweenInterpolatorKind` + `TweenInterpolator` registry. Numeric properties are the zero-overhead default; non-numeric types register adapters. No bolted-on one-off functions (the `createColorTween` proxy pattern is retired in favor of the generic seam).
2. **Performance is load-bearing.** The interpolator seam must not introduce generic reflection overhead for the common numeric case. Design for strict typing and zero-cost abstraction in the numeric path — this is the foundation for C/C++/Rust ports where runtime type dispatch is expensive.
3. **Deterministic, value-typed core.** The tween entity is plain data with free functions. The core interpolation logic is deterministic and headlessly testable — suitable for the Rust mirror.
4. **Free functions over the `Tween` entity, sentinels for expected-missing, throws only on misuse.** `getTweensOf` → `[]`, `hasTweensOf` → `false`, `killTweensOfProperty` no-ops when none match. `resolvePropertyEndValue` throws on bad relative syntax (programmer error).
5. **Tween signals are fundamental.** `onUpdate`, `onComplete`, `onStart`, `onRepeat`, and `onYoyo` are part of the entity's core contract — they are not optional subsystem signals gated behind an `enable*` function. Tween callbacks are what makes tweens useful; requiring opt-in would add a mandatory setup step for every user.

## Boundaries

**In scope:**

- Property tweening: `createTween`/`createTweenFrom`/`createTweenFromTo`, relative values, easing, delay, repeat, yoyo, `timeScale`.
- Manager: `createTweenManager`, target-keyed tween lists, scope verbs (`stop*/pause*/resume*/reset*`), introspection (`getActiveTweenCount`/`getTweensOf`/`hasTweensOf`/`killTweensOfProperty`).
- Time control: `getTweenProgress`/`seekTween`/`setTweenProgress`/`invalidateTween`/`restartTween`.
- Stagger: `createTweenStagger` with per-index delay, `from` modes, `staggerEase`.
- Value-interpolator seam: `TweenInterpolatorKind` + `TweenInterpolator` registry, color as the first adapter, geometry bridges as downstream adapters.
- Single-object sequencing (tween chains, sequence/parallel within one target's property animation).
- Lifecycle signals: `onUpdate`, `onComplete`, `onStart`, `onRepeat`, `onYoyo`.
- Per-property easing (once the seam exists).
- Multi-keyframe / waypoints (once per-property detail exists).
- `createTweenTimer` (duration-only timer with no property animation).

**Non-goals:**

- Multi-object orchestration / MovieClip-style frame-keyed animation (→ `@flighthq/timeline`).
- Easing curve definitions (→ `@flighthq/easing`).
- The time primitive / clock abstraction (→ `@flighthq/clock`, a new package).
- The frame loop (→ `@flighthq/application`).
- Declarative tween authoring / import format (→ `@flighthq/tween-formats`, gated on consumer).

## Decisions

- **[2026-07-02] Value-interpolator seam: open registry, performance-first.** Bless `TweenInterpolatorKind` + `TweenInterpolator` as an open registry (`registerTweenInterpolator`). The numeric case (plain property assignment) must remain zero-overhead — the registry engages only for non-numeric types (color, vector, unit, array). Color is rebuilt as the first adapter, retiring the `createColorTween` proxy pattern. Design for strict typing suitable for C/C++/Rust ports — avoid generic reflection.

  **Why:** The interpolator seam is the package's keystone. It fixes the `createColorTween` proxy bug, unblocks per-property easing, keyframes, and the geometry bridge, and does so via the established open-registry pattern (fork B). Performance caveat is critical — the common numeric path must not pay for the registry's existence.

- **[2026-07-02] `createColorTween` retired in favor of generic adapter.** Once the interpolator seam exists, the bespoke `createColorTween` function is replaced by a registered color adapter that writes to the real target/key. The old proxy pattern (which defeats `stopTweens`/`getTweensOf`/`killTweensOfProperty`) is removed, not shimmed.

  **Why:** The proxy is a live correctness bug. The generic approach is cleaner and unifies with the seam, provided performance is acceptable.

- **[2026-07-02] Tween signals are fundamental — exempt from `enable*` rule.** `onUpdate`, `onComplete`, `onStart`, `onRepeat`, and `onYoyo` are part of the core tween contract. They are NOT gated behind an `enableTweenSignals()` function. Tweens without completion callbacks are useless; requiring opt-in would add a mandatory setup step for 100% of users.

  **Why:** The `enable*` signal-group rule was designed for optional subsystems (display object signals, graph signals) where many users never need them. Tween callbacks are the core API — every tutorial starts with "do X on complete." Same class of exemption as `Readonly<>` on callable types.

- **[2026-07-02] Tween owns single-object sequencing; timeline owns multi-object.** `createTweenSequence`/`createTweenParallel` (position params, labels) belong in `@flighthq/tween` — a tween timeline has no display-object coupling. `@flighthq/timeline` owns MovieClip-style frame-keyed animation and multi-object orchestration. There may be a shared sequencing primitive underneath that both compose.

  **Why:** Single-object property sequencing is a natural extension of the tween API. Multi-object orchestration has different concerns (cross-object timing, display-object lifecycle). The shared primitive underneath is an open direction worth exploring.

- **[2026-07-02] `@flighthq/clock` blessed as a shared time primitive.** Time-related concerns (`timeScale`, `pause`/`resume`/`seek`, elapsed tracking) are currently scattered across tween, timeline, signals (throttle/debounce), and application. A `Clock` entity with hierarchical clocking (child clocks inherit parent scale; pause the parent, everything pauses) is the missing primitive. Tweens and timelines would read from a clock rather than raw `deltaTime`. Signal throttle/debounce would consume a clock tick.

  **Why:** `timeScale` appearing on both `Tween` and `TweenManager` is a decomposition smell — it's a time primitive that hasn't been extracted yet. The same smell appears in timeline and signal throttling. Extraction follows the "complexity is a decomposition smell" rule.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture for all packages: TS leads, Rust follows in dedicated parity passes. Each TS addition does not need a same-pass Rust port.

  **Why:** TS defines the feature target and API shape. Rust is an implementation that conforms. This is a global ruling, not per-package.

## Open directions

1. **`defaultManager` singleton.** The import-time module singleton is shared mutable state (`createTweenManager()` at import). It allocates only an empty `Map` + easing ref (technically side-effect-free), but it's "magic" — a user who imports tween functions gets a hidden global manager. The "no magic" rule leans against it; the GSAP global-timeline analogy leans for it. Not yet decided.

2. **`@flighthq/clock` design.** Blessed as a concept, but the design needs a dedicated session: the `Clock` entity shape, hierarchical clocking, how tweens/timelines/signals consume it, whether it replaces or wraps `deltaTime`, and the relationship to `@flighthq/application`'s frame loop. Cross-package.

3. **Shared sequencing primitive.** Whether tween's single-object sequencing and timeline's multi-object orchestration share a decomposed sequencing primitive underneath, or compose independently.

4. **`@flighthq/tween-formats` neighbor.** Declarative tween authoring import. Gated on a confirmed consumer — no speculative build.

5. **Snapping/overshoot refinement.** `snapping` is a boolean integer round. Per-property snap increment and `clampOvershoot` guard for elastic/back eases. Sequenced after the interpolator seam (per-property detail).

6. **Performance pass.** Pooled `Tween`/`TweenPropertyDetail`, swap-remove instead of `splice`, drop `seekTween`'s per-call `writes[]` allocation, 10k-concurrent benchmark. Gold-tier, after the seam settles.
