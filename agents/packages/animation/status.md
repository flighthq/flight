---
package: "@flighthq/animation"
updated: null
by: null
---

# animation — Status Log

> Append-only handoff log, newest entry on top. Each entry: what changed, what's in-flight, what to
> watch next. Incoming status documents land here.

<!-- newest entry on top -->

## 2026-07-24 — two-player crossfade controller

Added an explicit `AnimationCrossfade` controller over two players: caller-driven advancement, a plain
curve seam, target-matched channel sampling through the same visitor shape as `sampleAnimationClip`,
quaternion-aware two-way blending, one-sided channel pass-through, and completion polling for caller
retirement. The existing `accumulateAnimationSample` / `addAnimationSample` /
`finishAnimationSample` primitives remain the intended N-way foundation for a future blend tree; this
change deliberately stops at the two-player transition and does not introduce a state machine.
