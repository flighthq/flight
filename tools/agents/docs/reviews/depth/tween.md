# Depth Review: @flighthq/tween

**Domain**: Property tweening / interpolation animation — the engine that drives numeric (and color) properties of a target object from a start value to an end value over time, with easing, delay, repeat, yoyo, callbacks, and a manager that advances many tweens per frame. The canonical reference set is GreenSock/GSAP, TweenJS, anime.js, and the OpenFL-adjacent Actuate/Tweener/Tweensy family this SDK draws on.

**Verdict**: solid — 64/100

The package covers the spine of a real tweener and goes beyond a toy: a manager with per-target tween lists, overwrite resolution, delay, repeat (finite + infinite), reflect (yoyo), reverse, smart-rotation, snapping, completion/forced-complete, pause/resume at three scopes, a color tween, and a delay timer. It is genuinely usable. What keeps it from "authoritative" is the absence of the interpolation breadth (relative values, from/fromTo, multi-stop, per-property easing), sequencing/timeline composition, and the value-type coverage that mature tween libraries are expected to provide.

## Present capabilities

Creation and application

- `createTween` (manager-bound and default-manager overloads) — the core entry; reads `NumericProps<T>` end values, lazily captures start values at first update via `initializeTween`.
- `applyTween` — immediately set properties and cancel overlapping tweens (instant "set").
- `createColorTween` — packed `0xRRGGBB` color interpolation in float component space, written back as a rounded int each update. Good domain-correct touch (interpolating the packed int directly would be wrong).
- `createTweenTimer` — empty-target tween used purely for a delayed `onComplete`/`onUpdate` clock.

Manager and lifecycle

- `createTweenManager` / `defaultManager` — branded manager holding `Map<target, Tween[]>`, with a configurable `defaultEase` (defaults to `easeOutExponential`).
- `updateTweens(manager, dt)` — per-frame advance with in-place compaction (splices completed tweens, drops empty target lists).
- `completeTween` — force-finish honoring reverse/snapping and firing `onComplete`.
- `stopTween` / `stopTweens` / `stopAllTweens` — cancel, optionally jumping to final value (`complete`) and optionally suppressing the event (`sendEvent`); `stopTweens` supports a property-map filter so only overlapping properties are stopped.
- `pauseTween`/`pauseTweens`/`pauseAllTweens`, `resumeTween`/`resumeTweens`/`resumeAllTweens`, `resetAllTweens` — pause/resume at single/per-target/global scope.

Per-tween behavior (via `TweenOptions`)

- `delay`, `ease` (per-tween override), `repeat` (finite count + `-1` infinite), `reflect` (yoyo by flipping `reverse` each cycle), `reverse`, `smartRotation` (shortest-path angular normalization within ±180°), `snapping` (round to int each step), `overwrite` (property-overlap conflict resolution).
- Signals: `onUpdate`, `onComplete`, `onRepeat` via `@flighthq/signals` — multi-listener, the SDK-correct event mechanism.

Type surface in `@flighthq/types`: `Tween`, `TweenOptions`, `StopTweenOptions`, `TweenManager`, `TweenManagerOptions`, `TweenPropertyDetail`, `NumericProps`. Clean header layer; `NumericProps<T>` correctly narrows to number-typed keys.

## Gaps vs an authoritative tween library

Interpolation expressiveness (the largest gap — these are core, not exotic):

- **Relative values.** No `"+=100"` / `"-=50"` / delta API. Every authoritative tweener supports relative targets; here you can only specify absolute end values.
- **`createTweenFrom` / `createTweenFromTo`.** Only "to" semantics exist (start is always captured from the live target). No way to tween _from_ an explicit start to the current value, or to specify both endpoints. GSAP `from`/`fromTo`, TweenJS, anime all provide this.
- **Per-property easing.** A single `ease` applies to all properties of the tween. Mature libraries allow per-property easing and per-property duration/delay (staggering within one tween).
- **Multi-keyframe / waypoints.** No multi-stop interpolation (animate through a sequence of values for one property). GSAP keyframes, TweenJS `.to().to()`, anime keyframes.
- **Custom interpolators / non-numeric values.** Only `number` (and the bespoke color tween). No pluggable interpolator seam, no array/vector/string/unit-suffix ("100px") interpolation. `createColorTween` is hard-wired and one-off rather than an instance of a general "value adapter" mechanism.

Sequencing / composition:

- **No timeline.** There is no way to chain, sequence, stagger, or offset tweens relative to each other within this package. The SDK puts MovieClip-style timelines in `@flighthq/timeline`, but a programmatic _tween_ timeline (GSAP `gsap.timeline()`, TweenJS chaining) is a distinct, expected tweening feature — sequence/parallel groups, labels, position parameters, nested timelines. Its absence here is the second-largest depth gap. (Plausibly missing-by-design given `@flighthq/timeline`, but a tween timeline is not the same artifact; this should be a deliberate, documented boundary rather than an omission.)
- **No stagger helper.** No batch "tween N targets with incremental delay" convenience.

Time control and querying:

- **No timeScale / playback speed** per tween or per manager.
- **No seek / progress get-set.** Cannot read or set normalized progress (`getTweenProgress` / set to 0.5) or elapsed; `elapsed` is a public field but there is no scrubbing API and no recompute-on-seek.
- **No `invalidate` / restart / replay** of a started tween (re-capture start values, rewind).
- **No yoyo-with-repeat distinction.** `reflect` flips direction each repeat, but there is no separate "repeat without yoyo vs yoyo count" nor a `repeatDelay`.
- **No `onStart` signal** (fires once when delay elapses) — only update/complete/repeat. `onStart` is a standard callback in every reference library.

Robustness details:

- `delay` handling on repeat resets `elapsed = tween.delay`, so each repeat cycle re-incurs the delay; there is no `repeatDelay` separate from the initial `delay`, conflating the two.
- No overshoot/extreme-ease clamping option; `snapping` rounds but there is no per-property snap config.
- No global "kill tweens of property X across all targets" or tag/id lookup (`getTweensOf` exists in spirit via the Map, but is not exported as a query function).

## Naming / API-shape notes

- Naming is consistent and on-spec: full unabbreviated type words (`createTweenManager`, `updateTweens`, `stopAllTweens`), free functions over methods, `out`-free value style, entity/runtime-ish data `Tween` object with signals attached. Scope verbs (`*Tween` / `*Tweens` / `*AllTweens`) form a clean, predictable triple for stop/pause/resume.
- `createColorTween` returns `Tween<ColorComponents>` whose `target` is an internal `{r,g,b}` proxy, not the user's object — the actual write happens via an `onUpdate` listener. This is a reasonable implementation but it means the returned tween's `target`/`propertyMap` do not describe the visible effect, and `stopTweens(manager, userTarget)` will not find the color tween (it is registered under the proxy). That is a real correctness wrinkle for overwrite/stop semantics worth a comment or a redesign toward a general value-adapter.
- `defaultManager` is an exported module-level singleton constructed at import (`createTweenManager()`). It allocates only an empty Map and registers nothing, so it is side-effect-light, but it is shared mutable state — acceptable here, though a stricter reading of the side-effect-free rule would prefer callers create their own.
- `pauseTween`/`resumeTween`/`stopTween` take `Tween<any>`; the `any` is pragmatic but slightly loosens the otherwise-tight generic surface.
- A general interpolation seam would unify `createTween` and `createColorTween` and open the door to vectors/units — currently color is a special case bolted on.

## Recommendation

Treat this as **solid but not yet AAA**, and prioritize closing the interpolation and time-control gaps before declaring the domain done:

1. Add relative-value support and `createTweenFrom` / `createTweenFromTo` — these are table-stakes and small.
2. Add `onStart`, `getTweenProgress`/seek (recompute on set), `timeScale`, and `repeatDelay` (distinct from `delay`).
3. Introduce a pluggable value-interpolator seam so color (and future vector/unit) interpolation is one registered adapter, not a hard-wired function; this also fixes the `createColorTween` target/stop mismatch.
4. Decide and document the timeline boundary: either provide a programmatic tween timeline (sequence/parallel/stagger/labels) in this package or explicitly delegate to `@flighthq/timeline` and note the seam. As written it reads as missing-by-omission rather than missing-by-design.
5. Add `getTweensOf` / kill-by-property query exports to round out the manager surface.

Until at least (1)-(3) land, the package is a competent property tweener but falls short of an authoritative GSAP/TweenJS-class library.
