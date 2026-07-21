---
package: '@flighthq/animation'
updated: 2026-07-21
basedOn: ./review.md
---

# animation — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (partial, 40/100). The sampling kernel (track/clip/player, glTF-conformant cubic, quaternion slerp) is keep-worthy as-is; the review's headline gaps — blending, events, additive layers, state machine — are all charter-in-scope but gated on the mixer/layer Open direction or the flagged animation/skeleton/tween/timeline boundary, so the sweep-safe set below is the kernel-hardening and player-maturation slice.

## Depth gaps

1. **Add a target-free mixer/layer kernel.** Weighted clip accumulation, cross-fades, normalized quaternion blending, additive/override layers, and partial masks are the missing composition tier above sampling. Bindings remain separate consumers.
2. **Complete playback semantics.** Add clip markers/events, root-motion extraction, finite repeat and ping-pong behavior, robust seeking across markers, and deterministic transition behavior.
3. **Add authoring/runtime utilities without a kitchen sink.** Subclip/trim, key reduction, additive rebasing, clip validation, and binary/cursor sampling remain separable primitives. A later state machine/blend tree composes them rather than entering the sampler core.

## Recommended

1. Replace the linear keyframe scan in `sampleAnimationTrack` (from index 0 every call) with binary search — internal change, no API impact. (Cached per-channel cursor state is parked; see Backlog.)
2. Promote the sample-every-channel loop into the core as `sampleAnimationClip` (caller-supplied output buffer or per-channel visitor) so `scene`, `skeleton`, and future bindings share one loop instead of reimplementing it. Additive; `@flighthq/scene` adopts later.
3. Finished/looped notification behind an `enableAnimationPlayerSignals` opt-in — the review notes the SDK's `@flighthq/signals` + `enable*` convention "fits here exactly"; today `advanceAnimationPlayer` clears `playing` silently.
4. Loop modes on `AnimationPlayer`: ping-pong and finite repeat count alongside the existing boolean `loop`.
5. Player verbs and accessors: `playAnimationPlayer` / `stopAnimationPlayer` (symmetric with the existing `seekAnimationPlayer`) and `getAnimationPlayerNormalizedTime`.
6. `validateAnimationTrack` — sentinel-returning check for ascending times and `values.length === keyCount × components` (a malformed track currently samples `NaN` silently).
7. Track/clip utilities: `trimAnimationTrack`/subclip, key reduction, and `cloneAnimationTrack` / `cloneAnimationClip` / `cloneAnimationPlayer`.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Blending / mixing** (per-clip weight, weighted accumulation with quaternion renormalization, mixer state over multiple players; cross-fade/fade scheduling). _Parked — charter-in-scope (Decision 2026-07-03) but waiting on the mixer/layer Open direction: how layers compose (additive, override, blend)._
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

None.
