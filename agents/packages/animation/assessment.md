---
package: '@flighthq/animation'
updated: 2026-07-21
basedOn: ./review.md
---

# animation — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (partial, 40/100). The sampling kernel (track/clip/player, glTF-conformant cubic, quaternion slerp) is keep-worthy as-is; the review's headline gaps — blending, events, additive layers, state machine — are all charter-in-scope but gated on the mixer/layer Open direction or the flagged animation/skeleton/tween/timeline boundary, so the sweep-safe set below is the kernel-hardening and player-maturation slice.

## Depth gaps

1. **Compose target-free samples into mixer/layer policy.** The reusable weighted sample accumulator,
   normalized quaternion blend, and additive quaternion/vector atoms have landed. Per-clip grouping,
   cross-fade scheduling, additive/override layer ordering, and partial masks remain the missing policy
   tier above those atoms. Bindings remain separate consumers.
2. **Complete playback semantics.** Add clip markers/events, root-motion extraction, finite repeat and ping-pong behavior, robust seeking across markers, and deterministic transition behavior.
3. **Add authoring/runtime utilities without a kitchen sink.** Subclip/trim, key reduction, additive rebasing, clip validation, and binary/cursor sampling remain separable primitives. A later state machine/blend tree composes them rather than entering the sampler core.

## Recommended

None. The kernel-hardening tranche has landed: binary search, shared clip sampling, opt-in player
signals, ping-pong/finite repeats, player verbs/normalized time, validation, clone, and trim. Key
reduction remains a depth utility rather than a sweep correction.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Blending / mixing** (per-clip weight, mixer state over multiple players, cross-fade/fade
  scheduling). _Parked — weighted scalar/vector/quaternion accumulation and blend atoms are now
  available; the remaining charter-in-scope policy needs the mixer/layer Open direction: how layers
  compose (additive, override, blend)._
- **Additive animation** (`makeAnimationClipAdditive` rebase + additive layers). _Parked — the rebase utility is well-defined but layer composition rides the same mixer/layer design._
- **Clip events / time markers.** _Parked — charter-in-scope, but the marker data model (markers on clips vs channels, payload shape) is undecided; the player finished/looped signals above are the sweep-safe slice._
- **Per-channel weight / joint masking.** _Parked — charter Open direction; mask ownership is shared with `skeleton` (the joint-mask is inherently a skeleton concept per its review)._
- **Cached sample-cursor state** (per-player/per-channel last-index). _Parked — needs a new sample-state type on the player or channel; the review flags this as design-pass territory since the target-free track cannot hold it._
- **Clip serialization** (serialize/validate posture of filters/effects/particles). _Parked — pending the scene-serialization naming fork; the codec vocabulary should be settled once, not invented here._
- **Root motion** extraction/accumulation. _Parked — binding semantics cross into `scene`/`skeleton`._
- **Animation graph / state machine.** _Parked — charter long-term scope; API shape (declarative graph vs imperative builder) is an Open direction._
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
