---
package: '@flighthq/animation'
status: partial
score: 40
updated: 2026-07-03
ingested:
  - source
  - tests
---

# animation — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/animation.md)._

**Domain:** Target-free keyframe animation core — sampled tracks (step/linear/cubic, quaternion slerp), channel/clip bundling, and an explicit playhead driver — for a 3D (and eventually general) animation system.

**Verdict:** partial — completeness 40/100

The package exports eight functions across three files: track construction and sampling (`createAnimationTrack`, `sampleAnimationTrack`), clip/channel assembly (`createAnimationChannel`, `createAnimationClip`, `getAnimationClipDuration`), and a playhead (`createAnimationPlayer`, `advanceAnimationPlayer`, `seekAnimationPlayer`). What exists is genuinely well-built: the sampler is alloc-free, glTF-conformant (cubic layout `[inTangent, value, outTangent]`, tangents scaled by segment duration), slerps quaternion tracks with shorter-arc selection and an nlerp fallback, and bridges to `@flighthq/easing` via `track.easing`. But measured against an AnimationMixer-class system (three.js `AnimationMixer`/`AnimationAction`, glTF animation runtimes, ozz-animation's sampling+blending jobs, Unity Playables), the defining capability of the domain — **blending multiple simultaneous animations** — is entirely absent, along with events, additive layers, cross-fades, and every track/clip utility. This is a correct sampling kernel, not yet an animation system.

## Present capabilities

- `createAnimationTrack` / `sampleAnimationTrack` — the core sampler. Flat `times`/`values` buffers (`ArrayLike<number>`, so `Float32Array` from a glTF accessor works zero-copy), `components` width (scalar/Vector3/quaternion/arbitrary — morph-weight tracks of width N work for free), `Step`/`Linear`/`Cubic` interpolation, quaternion slerp on linear 4-component tracks, cubic renormalization for quaternion tracks, per-segment easing reshape, clamped extrapolation, and well-tested edge cases (empty track → zeros, single keyframe, exact-boundary times). Out-parameter, hot-loop-safe. This is the strongest part of the package.
- `createAnimationChannel` / `createAnimationClip` / `getAnimationClipDuration` — channel = track + opaque `targetRef`; clip duration defaults to the latest keyframe across channels with an explicit override. Deliberately target-free: the binding layer (`applyAnimationClipToScene` in `@flighthq/scene`, reading `SceneAnimationTarget { node, path }`) interprets `targetRef`.
- `createAnimationPlayer` / `advanceAnimationPlayer` / `seekAnimationPlayer` — an explicit, caller-driven playhead: `speed` (negative plays backward), `loop` (modulo wrap in both directions), clamp-and-stop at either end when not looping, zero-duration guard, seek clamped to `[0, duration]`. Eleven player tests cover the loop/clamp/backward matrix thoroughly.

Types (`AnimationTrack`, `AnimationChannel`, `AnimationClip`, `AnimationPlayer`, `AnimationInterpolation`, `SceneAnimationTarget`) live in `@flighthq/types` with excellent doc comments — header-layer-first, correct.

**Where the flagged animation/skeleton/tween boundary currently lands:** the register marks this boundary "still to design"; the code has already taken a defensible de-facto position. `animation` owns target-free sampling and time; `scene` owns the 3D TRS binding (`SceneAnimationTarget` + `applyAnimationClipToScene`); `skeleton` owns none of the sampling — joints are ordinary `SceneNode`s driven through the scene binding, and the skeleton package only does skinning math. `tween` is untouched; the only bridge is `track.easing: EasingFunction | null`. The unresolved seams are (a) `AnimationPlayer` vs tween's own time driver vs the planned `clock` primitive — three playhead concepts with no shared type — and (b) whether property-tweening ever routes through `AnimationChannel` (the `targetRef: unknown` escape hatch suggests it could, but nothing defines a tween-side target). The design pass should ratify or move these lines explicitly.

## Gaps vs an authoritative keyframe-animation library

- **Blending / mixing — the headline gap.** No way to play two clips on the same target and weight them: no per-clip weight, no `blendAnimationSample`/mixer accumulation buffer, no normalized weighted sum with quaternion nlerp accumulation (the three.js `PropertyMixer` / ozz `BlendingJob` role). Without this there is no walk↔run blend, no partial-body overlay — the reason AnimationMixer-class systems exist.
- **Cross-fading and scheduling:** no `crossFade`, `fadeIn`/`fadeOut`, no action lifecycle (scheduled start, warp/time-scale sync of two clips of different durations).
- **Additive animation:** no additive layers, no `makeAnimationClipAdditive` (rebasing a clip against a reference pose/first frame — standard in glTF tooling and three.js `AnimationUtils`).
- **Masking / per-channel control:** no per-channel enable/weight, no joint-mask concept for upper-body/lower-body splits.
- **Loop modes:** boolean `loop` only. No ping-pong, no finite repeat count (`repetitions`), no "clamp when finished" vs "hold last frame" distinction beyond the implicit clamp.
- **Events / notifications:** no animation events (markers at times firing callbacks/signals), no finished/looped notification from `advanceAnimationPlayer` — the caller must poll `playing`. The SDK has `@flighthq/signals` and an `enable*` convention that fits here exactly.
- **Sampler seek performance:** `sampleAnimationTrack` linear-scans from index 0 every call (`while (i < count - 1 && times[i + 1] <= t) i++`). Authoritative samplers keep a cached cursor (per-player last-index state) or binary-search; for a 30 s, 30 Hz track this is ~900 iterations per channel per frame. The target-free design makes cursor state awkward on the track itself — it belongs on the player or a per-channel sample state, which is exactly the kind of type the design pass should add.
- **Clip sampling in the core:** there is no `sampleAnimationClip` — the "sample every channel at time t" loop lives only inside `@flighthq/scene`'s binding. A core clip sampler writing into a caller-supplied output (or invoking a per-channel callback) would let non-scene domains (skeleton-only pipelines, tween targets, morph weights) reuse the loop instead of reimplementing it.
- **Track/clip utilities:** no `trimAnimationTrack`/subclip, no resample/bake, no key reduction/optimize, no `validateAnimationTrack` (ascending times, values length = keys × stride — currently a malformed track silently reads `undefined` as `NaN`), no `cloneAnimationClip`, no serialization (every other descriptor family in the SDK — filters, effects, particles — has serialize/validate).
- **Root motion:** no extraction/accumulation of root translation — expected in any character-animation-capable core.
- **Player conveniences:** no `getAnimationPlayerNormalizedTime`, no `stopAnimationPlayer`/`playAnimationPlayer` verbs (callers poke `playing` directly, which is fine for plain data but asymmetric with `seekAnimationPlayer` existing as a function).

## Naming / API-shape notes

- Names carry the full type word (`sampleAnimationTrack`, `advanceAnimationPlayer`) and are globally self-identifying — fully aligned with the SDK rule.
- `sampleAnimationTrack(out, track, t)` is out-parameter-first, alloc-free, and documented as such; matches the geometry convention. Good.
- `createAnimationTrack(opts)` takes an options object while `createAnimationChannel(track, targetRef)` and `createAnimationClip(channels, duration?)` take positional args — mildly asymmetric but each reads naturally.
- `AnimationChannel.targetRef: unknown` is an untyped seam. It buys target-freedom, but `unknown` in the header layer means the binding contract is discoverable only by reading `@flighthq/scene`. Consider a branded/documented `AnimationTargetRef` alias, or an open kind-keyed binding registry (the SDK's stated preference over implicit dispatch) so each domain registers its target interpretation.
- `applyAnimationClipToScene` type-sniffs `targetRef` (`typeof target === 'object' && target.node !== undefined`) — structural guessing rather than a kind tag; a `SceneAnimationTarget` with an explicit discriminant (or the registry above) would match the string-kind identity model.
- The player mutates entity fields directly and `advanceAnimationPlayer` clears `playing` as a side effect of reaching an end — correct per the docs, but the missing finished-signal means the state change is silent.

## Recommendation

The sampling kernel is keep-worthy as-is; build the system on top of it, in this order:

1. **Blending first** — a per-channel/per-clip weighted accumulation primitive (`accumulateAnimationSample` + finalize with quaternion renormalization) and a small mixer state over multiple players. This is the single capability that separates a sampler from an animation library, and skeleton/scene both need it.
2. **Promote the clip-sampling loop into the core** (`sampleAnimationClip` or a per-channel visitor) so scene, skeleton, and future tween bindings share one loop; type the `targetRef` seam (kind-tagged target or binding registry).
3. **Player maturation:** cached sample cursors (per-channel last-index state on the player), finished/looped signals behind an `enableAnimationPlayerSignals` opt-in, ping-pong + repeat-count loop modes, `getAnimationPlayerNormalizedTime`.
4. **Utilities:** `validateAnimationTrack`, subclip/trim, additive rebase (`makeAnimationClipAdditive`), key reduction, clip serialization — matching the serialize/validate posture of filters/effects/particles.
5. **Run the flagged boundary design pass** and record the outcome: player-vs-tween-vs-`clock` time drivers, and whether tween targets ride `AnimationChannel`.

Quality is high; the architecture (target-free core + domain bindings) is the right skeleton for an authoritative library. The score is a scope score: without blending, events, and clip utilities it covers roughly the first third of the domain.
