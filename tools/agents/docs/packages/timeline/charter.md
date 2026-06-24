---
package: '@flighthq/timeline'
crate: flighthq-timeline
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# timeline — Charter

> Durable vision and core values for `@flighthq/timeline`. You author this (via an agent transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

MovieClip-style frame timeline playback — a playhead engine that advances through numbered frames at a frame rate, supports labels and frame navigation (`gotoAndPlay`/`gotoAndStop`/`next`/`prev`), and drives a display object via a per-frame "construct" callback. This is the Flash/OpenFL MovieClip + Timeline model, redesigned around an explicit `TimelineSource` contract so any format (hand-authored keyframes, spritesheet, future SWF importer) can feed the same engine.

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to._

## Boundaries

_TODO — in scope / explicitly NOT in scope (non-goals)._

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
