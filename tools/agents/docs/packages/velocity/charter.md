---
package: '@flighthq/velocity'
crate: flighthq-velocity
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# velocity — Charter

> Durable vision and core values for `@flighthq/velocity`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

Per-frame, per-object 2D motion (velocity) tracking — a generic "velocity field" seam that any system (transform delta, tween, physics, camera, manual edit) contributes screen-space velocity into, and any consumer (primarily GPU motion-blur velocity-buffer writers) reads out. Its `package.json` description: "Generic per-node velocity field and contributors (transform-delta baseline + explicit overrides)."

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
