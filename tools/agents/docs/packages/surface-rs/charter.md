---
package: '@flighthq/surface-rs'
crate: null
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# surface-rs — Charter

> Durable vision and core values for `@flighthq/surface-rs`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

wasm-backed (Rust) drop-in for `@flighthq/surface` — a binding/acceleration layer, not a standalone image-processing library. Its job is to provide byte-for-byte-compatible, identical-signature implementations of the bulk per-pixel `@flighthq/surface` operations that run in Rust/wasm and amortize the JS↔wasm boundary over a single crossing per call, while re-exporting the rest of the surface API unchanged.

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
