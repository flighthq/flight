---
package: '@flighthq/animation'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# animation -- Review

**Verdict:** solid -- 78/100. A deep, well-structured target-free animation engine covering tracks, clips, players, blending, crossfades, blend trees, state machines, layer stacks, root motion, and clip events. Architecture is clean and the charter's core principles are lived faithfully. The remaining gaps (blend spaces, per-edge state machine transitions, additive clip creation, clip serialization) separate solid from authoritative.

## Present capabilities

The package comprises 11 source files (1,770 lines of implementation) with 11 colocated test files (1,707 lines). The public lane (`index.ts`) exports 54 functions; the contract lane (`contract.ts`) re-exports everything via `export *` from 9 modules. Dependencies are minimal: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types`.

### Track layer (`animationTrack.ts`, 293 lines)

- `createAnimationTrack` -- allocates a track from `times`/`values` buffers. Defaults: linear interpolation, 1 component, non-quaternion.
- `sampleAnimationTrack` -- binary-search sampler, alloc-free and hot-loop safe. Handles Step (hold previous), Linear (component-wise lerp or quaternion slerp with shorter-arc selection and nlerp fallback at parallel alignment), and Cubic (glTF-style Hermite spline with `[inTangent, value, outTangent]` layout, tangents scaled by segment duration, quaternion renormalization). Per-segment and per-track easing via `track.easing` and `track.segmentEasings`. Clamps outside the time range.
- `cloneAnimationTrack` -- deep copy preserving Float32Array backing.
- `trimAnimationTrack` -- extracts a subclip by keyframe time range, rebasing times to zero.
- `validateAnimationTrack` -- structural validation returning null or diagnostics array (ascending times, values length, segment easing count). Sentinel return, no throws.

### Clip layer (`animationClip.ts`, 90 lines)

- `createAnimationChannel` -- pairs a track with an opaque `targetRef: unknown`.
- `createAnimationClip` -- bundles channels and sorted clip events. Duration auto-computed from latest keyframe or event time; explicit duration validated against event times.
- `createAnimationClipEvent` -- allocates a `{ time, name, payload }` marker.
- `cloneAnimationClip` -- deep copy of channels (cloned tracks) and events; `targetRef` by reference.
- `sampleAnimationClip` -- samples every channel at a time, calling a per-channel visitor with the shared scratch buffer. Core loop promoted from scene bindings into the animation core.
- `getAnimationClipDuration` -- accessor.

### Player (`animationPlayer.ts`, 242 lines)

- `createAnimationPlayer` -- explicit playhead driver. Defaults: looping, Repeat mode, infinite repeats, playing, speed 1, time 0, signal-free.
- `advanceAnimationPlayer` -- advances by `dt * speed`. Supports `Repeat` (wrap), `PingPong` (reflect and flip speed), finite `repeatCount` (each wrap/bounce consumes one, stops at 0). Non-looping clamps to `[0, duration]` and clears `playing`. Emits opt-in `onFinished`, `onLooped`, and `onEvent` signals. No-op when paused or zero-duration.
- `cloneAnimationPlayer` -- shallow copy sharing the clip by reference; clone starts signal-free.
- `enableAnimationPlayerSignals` -- idempotent attachment of `onFinished`, `onLooped`, `onEvent` signals.
- `playAnimationPlayer` / `stopAnimationPlayer` / `seekAnimationPlayer` -- play/stop/seek verbs.
- `getAnimationPlayerNormalizedTime` -- returns `time / duration`, clamped to `[0, 1]`.

### Blend primitives (`animationBlend.ts`, 179 lines)

- `createAnimationSampleAccumulator` / `resetAnimationSampleAccumulator` -- reusable target-free accumulation state (Entity, Float32Array-backed).
- `accumulateAnimationSample` -- weighted accumulation with quaternion sign-alignment.
- `finishAnimationSample` -- normalize weighted sum (divide by weight for scalars, geometric normalize for quaternions). Returns `false` for empty accumulators (sentinel).
- `blendAnimationSamples` -- two-sample lerp/slerp by alpha. `out` may alias either input.
- `addAnimationSample` -- additive delta composition: `base + delta * weight` for scalars; weighted quaternion from identity multiplied onto base for quaternion tracks. `out` may alias inputs.

### Crossfade (`animationCrossfade.ts`, 148 lines)

- `createAnimationCrossfade` -- two-player transition with target correspondence built at construction (channels matched by identity equality of `targetRef`). Allocates sample scratch once. Customizable curve via options.
- `advanceAnimationCrossfade` -- advances both players and updates transition weight.
- `sampleAnimationCrossfade` -- blends matched targets by weight; one-sided targets pass through.
- `isAnimationCrossfadeComplete` -- checks elapsed against duration (ignoring curve overshoot).

### Blend tree (`animationBlendTree.ts`, 167 lines)

- `createAnimationBlendTree` -- N-way target correspondence layout from a list of `AnimationBlendTreeInput`s. Validates unique `targetRef` per input, compatible component widths and quaternion flags across inputs. One accumulator per target. Shared player identity tracked.
- `createAnimationBlendTreeInput` -- leaf descriptor: player + weight + additive flag.
- `advanceAnimationBlendTree` -- advances each distinct player exactly once (deduplication).
- `sampleAnimationBlendTree` -- visitor pattern over all targets. Override leaves normalized weighted accumulation, then additive leaves compose deltas in stable input order.
- `sampleAnimationBlendTreeChannel` -- per-channel seam for layer stack composition.
- `setAnimationBlendTreeInputWeight` -- updates weight by index; returns `false` for absent index (sentinel).

### State machine (`animationStateMachine.ts`, 220 lines; `animationStateMachineAdvance.ts`, 30 lines)

- `createAnimationStateMachine` -- named-state controller with global target correspondence. States carry blend trees. Validates unique names and initial state. Construction-time scratch allocation (fromSample/toSample buffers).
- `createAnimationStateMachineState` -- allocates one named state over a blend tree.
- `transitionAnimationStateMachine` -- starts a timed transition to a named or indexed state. Customizable easing curve. Returns `false` for invalid/same destination or active transition (sentinel). Zero-duration transitions select immediately.
- `advanceAnimationStateMachine` -- advances current state (and both transition sides during a transition). Completes transition by elapsed duration. Player deduplication via owned scratch.
- `sampleAnimationStateMachine` / `sampleAnimationStateMachineChannel` -- samples current state or blends both transition sides. One-sided targets pass through.
- `getAnimationStateMachineCurrentState` / `isAnimationStateMachineTransitioning` -- query accessors.

### Layer stack (`animationLayerStack.ts`, 206 lines)

- `createAnimationLayerStack` -- ordered stack of layers, each sourced by a blend tree or state machine. Global target correspondence across all layers. Construction-time scratch allocation. Validates compatible tracks.
- `createAnimationBlendTreeLayer` / `createAnimationStateMachineLayer` -- allocates one layer with optional additive flag, weight, and channel-index subset (validated).
- `advanceAnimationLayerStack` -- advances all sources with cross-stack player deduplication.
- `sampleAnimationLayerStack` / `sampleAnimationLayerStackChannel` -- ordered pose composition: first override passes through, subsequent overrides blend by weight, additive layers compose weighted deltas.
- `setAnimationLayerWeight` -- updates weight by index; returns `false` for absent index (sentinel).

### Root motion (`animationRootMotion.ts`, 178 lines)

- `createAnimationRootMotionExtractor` -- allocates reusable scratch for one explicit channel (by index). Validates channel index and quaternion component count. Precomputes cycle delta (start-to-end displacement/rotation).
- `extractAnimationRootMotion` -- writes accumulated root delta across arbitrary unwrapped time (any number of loop cycles, forward or backward). Vector deltas add complete-cycle displacement; quaternion deltas compose via exponentiation-by-squaring. Returns `false` for insufficient output width (sentinel).

### Internal advance helpers (`animationAdvance.ts`, 17 lines)

- `advanceAnimationPlayers` -- deduplicating advance of a player list with caller-owned scratch. Used by layer stack and state machine advance.

## Gaps

Measured against industry-standard animation systems (Unity Mecanim/Playables, Unreal AnimGraph, ozz-animation, three.js AnimationMixer):

1. **Blend spaces.** `AnimationBlendTreeInput` carries a bare scalar `weight`. There is no 1D threshold mapping (parameter + sorted threshold per input) or 2D cartesian/freeform mapping (gameplay parameter pair mapped to barycentric weights). Every consumer reimplements the parameter-to-weight arithmetic. This is the charter-scoped feature that most gates "complete animation engine."

2. **Per-edge state machine transition configuration.** The state machine holds a single machine-wide `transitionDuration` / `transitionCurve` pair. All transitions share one timing. No per-edge configuration, no transition interruption (returns `false` if a transition is active), no transition queueing.

3. **`makeAnimationClipAdditive`** -- creating additive clips by subtracting a reference pose (first frame or explicit pose) is a standard tool in glTF workflows, three.js `AnimationUtils`, and Unity's additive clip pipeline. Additive leaves exist in blend trees and layer stacks, but there is no clip-level utility to produce them.

4. **Clip serialization/deserialization.** Every other descriptor family in the SDK (filters, effects, particles) has a serialize/validate posture. Animation clips have creation and cloning but no format-agnostic serialization.

5. **Key reduction / optimization / resample.** No `optimizeAnimationTrack` (key reduction for redundant keyframes) or `resampleAnimationTrack` (bake at a target sample rate). These are standard tools in animation pipelines and glTF exporters.

6. **No consumer demonstrates the root-motion round trip.** `extractAnimationRootMotion` returns the delta; applying it to a transform stays binding-owned per the charter boundary, but no consumer in the repo shows the integration. Status.md correctly notes this.

7. **Animation graph composition** -- the charter lists "animation graph/state machine (long-term)." The state machine is present but flat (no hierarchical sub-state machines, no sub-graph nesting). This is charter-acknowledged as long-term.

## Charter contradictions

None found. The code faithfully implements the charter's three North-star principles:

- **"Complete animation engine"** -- substantially met. Sampling, blending, events, state machines, blend trees, layer stacks, root motion are all present and reachable. The remaining gaps (blend spaces, per-edge transitions) are feature additions, not architectural contradictions.
- **"Animation clips are pure data; playback is a stateless sample operation with explicit time input"** -- yes. Clips are plain entities. `sampleAnimationTrack` and `sampleAnimationClip` take explicit time. Players are explicit driver entities advanced by the caller.
- **"Domain binding is external"** -- yes. `targetRef` is opaque `unknown`. The package has no scene, skeleton, or shape imports. External consumers (`scene2d`, `scene3d`, `skeleton2d`, `shape`, format codecs) implement their own binding layers.

The seven Decisions entries are all observed in the code. The 2026-07-25 and 2026-08-02 decisions (imperative transitions, flat weighted blend trees, channel-index masks, root motion extraction, sorted clip markers, MorphShape as external binding) are exactly what the implementation delivers.

## Contract and docs fit

### Package to contract

- **Types in `@flighthq/types`** -- 14 type files (`AnimationTrack`, `AnimationClip`, `AnimationPlayer`, `AnimationBlendTree`, `AnimationStateMachine`, `AnimationLayerStack`, `AnimationCrossfade`, `AnimationRootMotionExtractor`, `AnimationSampleAccumulator`, `AnimationChannel`, `AnimationClipEvent`, `AnimationInterpolation`, `AnimationLoopMode`, `AnimationTrackValidationDiagnostic`). No types defined inline in the package. Fully compliant.
- **Full unabbreviated names** -- all exported function names carry the full type name (`sampleAnimationTrack`, `advanceAnimationBlendTree`, `extractAnimationRootMotion`). Fully compliant.
- **Two blessed lanes** -- `.` (index.ts) and `./contract` (contract.ts). No other subpaths. Compliant.
- **`sideEffects: false`** -- declared in `package.json`. No module-level side effects. Compliant.
- **No `@flighthq/sdk` imports** -- confirmed. Package imports only from `entity/contract`, `signals/contract`, and `types/contract`.
- **Out-parameter convention** -- consistently used: `sampleAnimationTrack(out, track, t)`, `extractAnimationRootMotion(out, extractor, startTime, endTime)`.
- **`Readonly<T>`** -- consistently applied to read-only parameters across all functions.
- **Sentinel returns** -- used for expected failure: `transitionAnimationStateMachine` returns `false`, `setAnimationBlendTreeInputWeight` returns `false`, `finishAnimationSample` returns `false`, `extractAnimationRootMotion` returns `false`, `validateAnimationTrack` returns `null` for valid. Throws reserved for precondition violations (duplicate state names, incompatible track widths, invalid channel indices).
- **Explicit dependencies** -- all functions take what they need as arguments. No singletons, no module-scoped mutable state (aside from the two internal scratch constants `IDENTITY_QUATERNION` and `_quaternion` in `animationBlend.ts`, which are private constants and a scratch buffer for an internal helper, not shared state).

### Issues

- **Two exports unreachable through either blessed lane.** `advanceAnimationPlayers` (`animationAdvance.ts:7`) and `advanceAnimationStateMachineWithScratch` (`animationStateMachineAdvance.ts:6`) are `export function`s in modules that do not appear in `contract.ts`. Their only importers are intra-package (`animationLayerStack.ts`, `animationStateMachine.ts`) plus their colocated tests. They function as package-internal composition seams. Their `export` keyword is necessary for test imports but makes them API-shaped without being reachable. Status.md already identifies this.

- **Duplicated private helper.** `getLinearAnimationStateMachineTransitionWeight` is defined identically in both `animationStateMachine.ts:212` and `animationStateMachineAdvance.ts:26`. Both are private (not exported), so it does not affect the API surface, but it is a maintenance asymmetry -- changing one without the other would silently diverge behavior.

### Package Map accuracy

The codebase-map entry "3D data: ... `animation` ..." and "Animation and simulation: ..." both mention `animation`. The Package Map lists it among "3D data" packages alongside `mesh`, `lighting`, `texture`, `camera`. Given that the package is deliberately target-free and serves 2D, 3D, skeleton, and shape bindings equally, the "3D data" grouping is slightly misleading. However, this is a classification question for the codebase map, not a package defect.

## Test coverage

Every exported function has a corresponding `describe` block. Test coverage highlights:

- `animationTrack.test.ts` (288 lines) -- binary search, step/linear/cubic/quaternion interpolation, per-segment easing, empty/single-keyframe edge cases, trim, validation.
- `animationPlayer.test.ts` (275 lines) -- loop/clamp matrix (forward/backward, Repeat/PingPong, finite repeatCount), finished/looped/event signals, seek, stop, normalized time.
- `animationCrossfade.test.ts` (223 lines) -- target correspondence, matched/one-sided blending, quaternion crossfade, completion.
- `animationBlendTree.test.ts` (186 lines) -- N-way accumulation, additive leaves, shared player advancement, weight updates, quaternion blending.
- `animationStateMachine.test.ts` (181 lines) -- state transitions, transition completion, mid-transition sampling, initial state by name/index, zero-duration transition.
- `animationLayerStack.test.ts` (171 lines) -- override/additive layers, channel masks, cross-stack player deduplication, blend tree and state machine source layers.
- `animationBlend.test.ts` (112 lines) -- accumulation, additive composition, quaternion sign alignment, slerp blending, finish/reset.
- `animationClip.test.ts` (123 lines) -- clip creation, event validation, duration computation, clone, visitor-pattern sampling.
- `animationRootMotion.test.ts` (111 lines) -- vector/quaternion extraction, multi-cycle unwrapping, backward time ranges.
- `animationAdvance.test.ts` (16 lines) and `animationStateMachineAdvance.test.ts` (21 lines) -- minimal coverage of the internal advance helpers; exercises deduplication.

## Candidate open directions

The charter's Open directions says "None." The following questions arose during review; they are not assertions but candidates for the charter to address:

1. **Should blend spaces live in this package or in a separate `animation-blend` package?** The 1D/2D parameter-to-weight mapping is a distinct concern from the N-way accumulation primitive, and could be a separately importable composition.

2. **Should per-edge transition configuration be a state machine feature or a caller concern?** The charter says "conditions stay external and transitions are imperative." The current API enforces this for condition logic but also forces machine-wide timing, which may be a stronger constraint than intended.

3. **What is the relationship between `AnimationTargetRef` (`unknown`) and the broader kind-based registry pattern?** The SDK's stated preference is open kind-keyed registries over implicit dispatch. Currently each binding layer (`scene3d`, `skeleton2d`, `shape`) implements its own `targetRef` interpretation via structural checking rather than a kind tag.
