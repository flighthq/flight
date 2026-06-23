---
id: animation
title: '@flighthq/animation'
type: new-package
target: animation
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/animation.md
  - tools/agents/docs/reviews/breadth/spatial-3d (the "no 3D animation system at all" gap: `timeline`/`tween` are 2D/display-object oriented; nothing drives node TRS.md
  - tools/agents/docs/reviews/breadth/morph weights.md
  - tools/agents/docs/reviews/breadth/or skeleton poses; `joints0`/`weights0` are reserved but unbacked)..md
depends_on: []
updated: 2026-06-23
---

## Summary

Data-driven node animation for the 3D / general scene graph: animation clips made of per-target channels and keyframe samplers (step/linear/cubic-spline), an evaluator that drives `SceneNode` TRS, mesh morph-target weights, and skeleton joint poses, plus clip blending, layering, and a lightweight state-machine over named clips. Distinct from the 2D `@flighthq/timeline` (MovieClip frames) and `@flighthq/tween` (per-property easing tweens).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that lets a 3D developer animate node transforms from data — the 80%-value core.

- **Types in `@flighthq/types` (header first):**
  - `AnimationKind` string identifier (`'Animation'`); `AnimationTargetPathKind` strings for the canonical animatable paths: `'Translation'`, `'Rotation'`, `'Scale'` (TRS, matching glTF). Vendor-prefix convention reserved for custom paths.
  - `AnimationInterpolation = 'step' | 'linear' | 'cubicspline'`.
  - `AnimationSampler` — `{ times: Float32Array; values: Float32Array; interpolation: AnimationInterpolation; stride: number }` (flat typed arrays, C-offsetof-friendly, like `MeshGeometry`). `stride` = 1/3/4 for scalar/vec3/quat; cubicspline stores in-tangent/value/out-tangent triplets.
  - `AnimationChannel` — `{ targetNode: NodeId | string; targetPath: Kind; sampler: number }` (sampler index into the clip; `NodeId` for Rust-parity, name-path string resolved at bind time in TS).
  - `AnimationClip` — `{ name: string; duration: number; samplers: readonly AnimationSampler[]; channels: readonly AnimationChannel[]; kind: Kind }`.
  - `AnimationPlayer` (entity) + `AnimationPlayerRuntime` (opaque): `{ clip; time; speed; loop: AnimationLoopMode; playing: boolean }`; `AnimationLoopMode = 'once' | 'loop' | 'pingpong'`.
- **Clip construction & sampling (`@flighthq/animation`):**
  - `createAnimationClip(options: Readonly<AnimationClipOptions>): AnimationClip`
  - `createAnimationSampler(times, values, interpolation, stride): AnimationSampler`
  - `getAnimationClipDuration(clip): number` (max sampler time)
  - `sampleAnimationChannel(out: Float32Array, sampler: Readonly<AnimationSampler>, time: number): void` — out-param, alias-safe; binary-searches `times`, applies step/linear/`slerpQuaternion` (rotation) / cubic-spline (glTF Hermite form). Quaternion samplers normalize.
  - `findAnimationSamplerSegment(sampler, time): number` (sentinel `-1` before first key).
- **Evaluator → scene graph:**
  - `evaluateAnimationClip<Traits>(arena: NodeArena<Traits> /* or resolver */, clip: Readonly<AnimationClip>, time: number): void` — samples every channel and writes into each target's TRS, then composes the node `localMatrix` via geometry compose. Because `HasTransform3D` stores only `localMatrix` (no decomposed TRS), Bronze keeps a per-target scratch TRS in the player runtime and `composeMatrix4FromTranslationRotationScale` into `localMatrix`; invalidates world transform.
  - `bindAnimationClip(clip, root): AnimationBinding` — resolves name/path channel targets to concrete node references once, so per-frame evaluation does no string lookup (sentinel: unresolved channels dropped, not thrown).
- **Player lifecycle (free functions, explicit time):**
  - `createAnimationPlayer(clip, obj?): AnimationPlayer`
  - `updateAnimationPlayer(player, deltaTime): void` (advances `time`, applies loop mode, evaluates)
  - `playAnimation` / `pauseAnimation` / `stopAnimation` / `seekAnimation(player, time)` / `setAnimationSpeed(player, speed)`
  - `getAnimationPlayerRuntime(player): AnimationPlayerRuntime`, `isAnimation(node): node is …` guard.
- **Tests + docs.** Colocated `*.test.ts` per source file (sampler interpolation incl. quaternion slerp & cubic-spline, loop/pingpong wrap, alias-safe `out`, unresolved-target sentinel). Package shape copied from a nearby cell; `npm run packages:check` / `exports:check` / `order` clean.

Effort: moderate. The sampler math and TRS-compose are the substance; everything else is wiring. This is the shippable floor for spatial-3d.

### Silver

Competitive with a good 3D animation runtime (glTF-animation-complete, blendable, skinned).

- **Types in `@flighthq/types`:**
  - `AnimationTargetPathKind` additions: `'MorphWeights'` (drives mesh morph-target weights) and `'Color'` / generic `'Scalar'` for material/light property channels.
  - `AnimationLayer` — `{ clip; weight: number; blendMode: AnimationBlendMode; mask: AnimationMask | null }`; `AnimationBlendMode = 'override' | 'additive'`.
  - `AnimationMask` — per-target inclusion set (`Set<NodeId>` / name set) so a layer affects only an upper-body subset.
  - `AnimationMixer` (entity) + runtime — owns ordered `AnimationLayer[]`, an accumulation buffer per target, and the cross-fade state.
  - `MorphTarget` weight contract additions to the mesh header (`morphWeights: Float32Array` on the animatable node) — defined in types so `animation` writes them without depending on `mesh`.
  - `Skeleton`, `SkeletonJoint`, `SkeletonPose` types (header) so `animation` can pose a skeleton defined/implemented in `@flighthq/skeleton`.
- **Blending & layering (`@flighthq/animation`):**
  - `createAnimationMixer(obj?)`, `addAnimationLayer(mixer, layer)`, `removeAnimationLayer`, `setAnimationLayerWeight`, `updateAnimationMixer(mixer, deltaTime)` — evaluates all layers into an accumulation buffer, applies override/additive blend per channel, then commits to targets once. Additive layers blend against a reference/bind pose.
  - `blendAnimationPose(out, a, b, t)` and `blendAnimationTransform(outTRS, aTRS, bTRS, t)` (NLERP/SLERP for the rotation component) — out-param, alias-safe.
  - `crossFadeAnimation(mixer, fromLayer, toLayer, duration)` and `fadeInAnimationLayer` / `fadeOutAnimationLayer` — weight-ramped transitions, the everyday character-motion primitive.
- **Additive & root motion:**
  - `extractAnimationRootMotion(out: RootMotionDelta, clip, fromTime, toTime, rootNode)` — pulls the root translation/rotation delta out of a clip so locomotion can drive the character controller instead of teleporting the root. `applyAnimationRootMotion(node, delta)`.
- **Skeleton/skinning bridge (consumes `@flighthq/skeleton`):**
  - `evaluateAnimationClipToSkeletonPose(out: SkeletonPose, clip, time, skeleton)` — joint-targeted channels write into a `SkeletonPose` (local joint TRS) rather than scene nodes; `skeleton` then computes the world-joint + skin palette. `bindAnimationClipToSkeleton(clip, skeleton)`.
- **Morph weights:** `evaluateAnimationMorphWeights(out: Float32Array, clip, time, channelGroup)` for `MorphWeights` channels; clamping/normalization helpers.
- **State machine (named-clip player):**
  - `AnimationStateMachine` type + `createAnimationStateMachine`, `addAnimationState(machine, name, clip)`, `addAnimationTransition(machine, from, to, condition, duration)`, `setAnimationStateParameter(machine, name, value)`, `updateAnimationStateMachine(machine, deltaTime)`, `requestAnimationState(machine, name)` — the Animator-style layer the animation-motion review also flags as missing. Conditions are plain predicate data over a parameter map.
- **Signals (opt-in):** `enableAnimationSignals(player): AnimationSignals` with `onAnimationComplete`, `onAnimationLoop`, and **keyframe/marker events** (`AnimationEvent` markers in the clip → `onAnimationEvent`) for footstep/SFX sync. Lives here (owning package), gated behind `enable*`.
- **Time control:** `setAnimationMixerTimeScale` and a shared clock hook so animation can run under the same pausable/time-scaled domain the animation-motion review wants across subsystems.
- **Cross-backend / Rust parity scaffolding:** `flighthq-animation` + `flighthq-skeleton` reach feature parity for sampling, blending, layering, masks, and state machine; conformance scenes under `flighthq-functional` (e.g. `animation_blend`, `animation_skinned`) paired by name with TS functional tests; sampler/blend math fingerprint-identical TS↔Rust.

Effort: substantial — blending accumulation, the skeleton bridge, and the state machine are each real subsystems. This is where it becomes a credible engine animation layer.

### Gold

Authoritative / AAA — nothing a domain expert finds missing; full edge handling, performance, and 1:1 Rust parity.

- **Authoring & retargeting:**
  - `retargetAnimationClip(out, clip, sourceSkeleton, targetSkeleton, map)` — humanoid bone-map retargeting so one clip drives differently-proportioned skeletons (the feature that makes a clip library reusable).
  - `mirrorAnimationClip(out, clip, mirrorMap)` (left/right mirroring), `trimAnimationClip`, `concatAnimationClips`, `resampleAnimationClip(out, clip, fps)` (bake variable keys to fixed-rate), `compressAnimationClip(out, clip, tolerance)` (keyframe-reduction within an error bound), `reverseAnimationClip`.
  - `createAnimationClipFromKeyframes(channels)` author-side builder and `optimizeAnimationSampler` (remove redundant collinear keys).
- **Advanced blending:**
  - **Blend trees** — `AnimationBlendTree`, `createAnimation1DBlendSpace` / `createAnimation2DBlendSpace` (e.g. idle↔walk↔run on speed; directional locomotion on a 2D parameter), `evaluateAnimationBlendTree`. Nested blend nodes (blend of blends).
  - Per-joint blend masks with feathered weights; **layered additive** stacks (e.g. additive aim/lean over a locomotion base) with correct additive-reference handling.
  - **Inertialization / inertial blending** (`beginAnimationInertialBlend`, `updateAnimationInertia`) — modern transition smoothing without a fixed cross-fade window.
- **Constraints & procedural overlays (post-pose):**
  - `AnimationConstraint` set: look-at, aim, two-bone IK (`solveAnimationTwoBoneIk`), FABRIK chain IK, position/rotation/parent constraints, applied as a deterministic post-evaluation pass over the pose. (Full IK rigs may graduate to a `@flighthq/skeleton` or `@flighthq/ik` neighbor; the constraint _application order_ and pose hooks live here.)
- **Performance & memory:**
  - Pooled evaluation scratch (`acquireAnimationPose` / `releaseAnimationPose` brackets), SoA accumulation buffers, sampler cursor caching (resume from last segment instead of binary search when time advances monotonically), and batched `updateAnimationPlayers(players, deltaTime)` for large casts.
  - Optional **GPU skinning/morph** path realized in `skeleton-gl` / `skeleton-wgpu` (palette/morph texture upload) — the evaluator stays pure CPU; the GPU consumer is a render-package, not an `animation` backend.
  - LUT/baked-clip fast path for hot clips.
- **Robustness & edge cases:** empty clips, single-key samplers, NaN/denormal guards on quaternions (renormalize, sentinel-skip degenerate), out-of-range time clamping per loop mode, mismatched stride detection (programmer-error throw), masks referencing absent joints (sentinel-drop), additive with no reference pose (identity fallback). Documented alias-safety on every `out` function.
- **Full test + docs:** exhaustive interpolation/blend/state-machine/IK/retarget unit suites; functional conformance scenes for blend spaces, IK, root motion, additive layers; `npm run api` symmetry pass; visual-capture baselines for skinned/morph scenes across GL/WGPU.
- **1:1 Rust parity:** `flighthq-animation` matches every function and the divergence map records any intentional gaps; blend-space/IK/retarget math fingerprint-identical; the committed conformance map pairs each Rust scene to its TS functional test by name.

Effort: large and incremental — blend trees, IK/constraints, and retargeting are independently sizeable. Order within Gold: clip-editing utilities → blend trees → constraints/IK → perf pooling → GPU-skinning consumer → retargeting.

## Boundaries

- **Skeleton, joints, inverse-bind matrices, and the skin palette** live in `@flighthq/skeleton`, not here. `animation` produces a `SkeletonPose` (local joint TRS); `skeleton` turns it into world matrices + a palette and feeds the `joints0`/`weights0` consumer in the scene renderers. IK _solvers_ may live in `skeleton`/a future `ik` neighbor; `animation` owns only the constraint-application order in the pose pass.
- **Asset import** (glTF/GLB mesh+material+scene) is `@flighthq/gltf`; only the **animation+skeleton extraction** is `@flighthq/animation-formats`. The runtime package parses nothing.
- **Rendering** — uploading the skin palette / morph weights to the GPU is a render-package concern (`scene-gl`/`scene-wgpu`, or `skeleton-gl`/`skeleton-wgpu`), never an `animation` `set*Backend`.
- **2D motion stays in its packages.** `@flighthq/timeline` (MovieClip frames), `@flighthq/tween` (per-property easing tweens), `@flighthq/spritesheet` (cel animation) are untouched. `animation` is for the node/3D graph (TRS, morph, skeleton). A future spring solver (`@flighthq/spring`, flagged by animation-motion) is a separate cell; `animation` may _consume_ it as a transition smoother but does not own it.
- **The scene graph itself** (hierarchy, transforms, bounds, invalidation) stays in `@flighthq/node` / `@flighthq/scene`. `animation` writes into `localMatrix` / morph weights through node feature aliases and never owns graph structure.
- **No platform backend.** Animation is deterministic CPU math; introducing a `*Backend` seam here would be premature abstraction against the house rules.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **TRS vs. matrix storage.** `HasTransform3D` currently stores only `localMatrix` (no decomposed TRS). Animation is inherently TRS (separate translation/rotation/scale channels, slerp on rotation). Options: (a) keep TRS scratch in the player/mixer runtime and compose into `localMatrix` each frame (Bronze choice, zero header change); (b) add an optional `HasTransform3DTrs` feature/runtime tier in `@flighthq/types` that caches decomposed TRS on the node so multiple animators and constraints share it without re-decomposing. (b) is cleaner for blending/constraints but touches the node header — a cross-package decision to surface.
- **Channel target identity.** TS naturally resolves channels by node name/path at bind time; Rust resolves by `NodeId` against an arena. The header type uses `NodeId | string` — should TS also adopt a stable per-node animation handle so the two ports bind identically, or is name-path resolution an accepted TS↔Rust divergence in the conformance map?
- **State machine vs. blend tree ownership.** The Animator-style state machine is also wanted by the 2D animation-motion perspective. Should the state-machine _core_ (states, transitions, parameters, condition evaluation) be a backend-agnostic `@flighthq/animation-state` neighbor that both the 3D clip player and a 2D spritesheet/timeline player drive, rather than living inside `animation`? This affects whether the state machine is Bronze-of-a-shared-package or Silver-of-this-one.
- **Morph weight ownership.** Morph-target _data_ (the displaced vertex sets) belongs to `@flighthq/mesh`; the animated _weights_ are a per-node animatable property. Where does the `morphWeights` array live on the node, and which package defines its header — `mesh` (data owner) or a node-feature tier (animation writer)? Needs a types-layout decision before Silver.
- **Marker/event timing semantics.** Should keyframe events fire once per crossing (edge-triggered), and how are they handled under reverse playback, pingpong, and large `deltaTime` steps that skip a marker? Define the contract before shipping signals so it is consistent across TS and Rust.
- **Root motion accumulation across loops.** When a looping locomotion clip wraps, root-motion delta must stitch across the loop boundary without a discontinuity. Decide whether `extractAnimationRootMotion` is responsible for loop-aware accumulation or whether the mixer owns the running root transform.

## Agent brief

> Create `@flighthq/animation` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
