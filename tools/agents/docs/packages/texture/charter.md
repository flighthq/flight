---
package: '@flighthq/texture'
crate: flighthq-texture
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# texture — Charter

> Durable vision and core values for `@flighthq/texture`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

GPU texture bindings for a 3D/material pipeline — the data descriptors that tell a renderer _how_ to read an image as a texture (sampling state, color space, uv-transform) and the cubemap aggregate, sitting between `@flighthq/resources` (the pixel source) and the material/renderer layer (the backend that uploads and samples). It is explicitly not a pixel-manipulation library (that is `@flighthq/surface`) and not the GPU upload layer (that is `render-gl` / `render-wgpu`'s `*Texture` entries).

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
