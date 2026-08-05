---
package: '@flighthq/animation'
updated: 2026-07-21
basedOn: ./review.md
---

# animation — Assessment

See [charter](./charter.md) for blessed direction. The sampling kernel (track/clip/player,
glTF-conformant cubic, quaternion slerp) remains keep-worthy. Normalized/additive blending, crossfades,
blend trees, named state transitions, and masked ordered layers now form a complete target-free pose
composition tier; remaining work is playback events and separable authoring/runtime utilities.

## Depth gaps

1. **~~Keep mixing policy decoupled from bindings.~~** — retired 2026-08-05. N-way override/additive blend trees, crossfades, named state transitions, and channel-index-masked ordered layers compose target-free poses in animation, while Skeleton3D and MorphShape interpret opaque target references in their own binding layers; no target or skeleton dependency entered the sampling/composition core.
2. **Complete playback semantics.** Clip markers/events and root-motion delta extraction are complete.
   Explicit seek-event policy and interruption policy for active state transitions remain separable.
3. **Add authoring/runtime utilities without a kitchen sink.** Key reduction, additive rebasing, and cursor
   sampling remain separable primitives. The state machine/blend tree composes sampling and accumulation
   rather than entering the sampler core.

## Recommended

None. The kernel-hardening tranche has landed: binary search, shared clip sampling, opt-in player
signals, ping-pong/finite repeats, player verbs/normalized time, validation, clone, and trim. Key
reduction remains a depth utility rather than a sweep correction.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Additive animation rebasing** (`makeAnimationClipAdditive`). _Parked — ordered additive layer
  composition is implemented; automatic delta-clip authoring remains a separable utility._
- **Cached sample-cursor state** (per-player/per-channel last-index). _Parked — needs a new sample-state type on the player or channel; the review flags this as design-pass territory since the target-free track cannot hold it._
- **Clip serialization** (serialize/validate posture of filters/effects/particles). _Parked — pending the scene-serialization naming fork; the codec vocabulary should be settled once, not invented here._
- **Type the `targetRef` seam** (branded `AnimationTargetRef` or a kind-keyed binding registry replacing `scene`'s structural type-sniffing). _Parked — design decision / cross-package; candidate Open direction for the charter._
- **The animation/skeleton/tween/timeline boundary pass** (three playhead concepts — `AnimationPlayer`, tween's driver, the planned `clock`; whether tween targets ride `AnimationChannel`). _Parked — design decision / cross-package; candidate Open direction for the charter._

## Approved

- [2026-07-21 · completed] Target-free animation sample composition now has independent weighted
  accumulation, normalized override blending, additive vector/quaternion composition, reusable
  Entity-backed accumulator state, and reset/finalize atoms. These deliberately own no clips,
  targets, bindings, fade schedules, or layer policy.
- [2026-07-21 · completed] AnimationTrack, AnimationChannel, AnimationClip, and AnimationPlayer now
  extend Entity. Every `createAnimation*`, clone, and trim result uses `createEntity`, with runtime-key
  tests across all four product families.
- [2026-07-25 · completed] Flat N-way blend trees, imperative named state machines, and ordered
  override/additive layer stacks with validated per-source channel masks compose target-free poses.
- [2026-07-25 · completed] Reusable explicit-channel root-motion extractors accumulate additive vector
  or compositional quaternion deltas over forward/reverse looped ranges without applying bindings.
- [2026-07-25 · completed] Sorted clip-level events with opaque payloads report forward/reverse,
  Repeat, and PingPong crossings through the player's opt-in signal.
