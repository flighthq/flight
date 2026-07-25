---
package: "@flighthq/animation"
updated: null
by: null
---

# animation — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-25 — N-way blend tree and explicit state machine

Added the crossfade successor as two composed target-free layers. `AnimationBlendTree` normalizes any
number of positive-weight override players per target, then applies ordered additive players through
the existing accumulate/add/finish primitives; player identity is advanced once even when shared by
multiple leaves. `AnimationStateMachine` owns named blend-tree states and one explicit timed transition,
with precomputed target correspondence and reusable scratch so sampling stays allocation-free.
Gameplay conditions remain caller-owned: the caller requests a transition by name rather than the core
polling hidden predicates. The crossfade example now demonstrates idle transitioning into a 70/30
walk/run blend tree.

## 2026-07-24 — two-player crossfade controller

Added an explicit `AnimationCrossfade` controller over two players: caller-driven advancement, a plain
curve seam, target-matched channel sampling through the same visitor shape as `sampleAnimationClip`,
quaternion-aware two-way blending, one-sided channel pass-through, and completion polling for caller
retirement. The existing `accumulateAnimationSample` / `addAnimationSample` /
`finishAnimationSample` primitives remain the intended N-way foundation for a future blend tree; this
change deliberately stops at the two-player transition and does not introduce a state machine.
