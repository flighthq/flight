---
package: '@flighthq/movieclip'
crate: flighthq-movieclip
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# movieclip — Charter

## What it is

`@flighthq/movieclip` is the **display-object composition layer** that wraps a `Timeline` and drives a `DisplayObject`. It is the consumer half of the timeline/movieclip split — timeline is the pure frame engine, movieclip is the display-object-specific wrapper that bridges timeline + spritesheet + display object concerns.

MovieClip owns: `createMovieClip`, `updateMovieClip`, `enableMovieClipSignals`, `MovieClipSignals` (a separate interface, not an alias of `TimelineSignals`), frame-script mirrors, goto/play/stop mirrors, `createSpritesheetTimelineSource` (moved from spritesheet), and what was planned as `@flighthq/timeline-spritesheet`.

Blessed as a new package during the timeline direction session (2026-07-02). Source currently lives in `packages/timeline/src/movieClip.ts` and will be extracted.

_(Needs a full direction session to design MovieClipSignals shape, recursion behavior, and spritesheet bridging.)_

## North star

_TODO — needs direction session._

## Boundaries

**In scope (from timeline charter decisions):**

- MovieClip entity — display-object node that wraps a timeline
- `MovieClipSignals` — separate interface from `TimelineSignals`, with clip-specific signals
- `createSpritesheetTimelineSource` — bridge from spritesheet frames to timeline source
- Frame-script mirrors, goto/play/stop mirrors delegating to underlying timeline
- `timeline-spritesheet` scope absorbed here

**Non-goals:**

- The timeline engine itself — that stays in `@flighthq/timeline`
- Rendering — renderers consume display objects

**Dependencies:** `timeline` + `types` (displayobject and spritesheet types-only)

## Decisions

_Append-only, dated, blessed rulings. None recorded yet — package is pre-direction._

### Origin decisions (from timeline charter)

- **[2026-07-02 · timeline charter]** Timeline/MovieClip split. MovieClip is the display-object composition layer.
- **[2026-07-02 · timeline charter]** `MovieClipSignals` is a separate interface, not an alias of `TimelineSignals`.
- **[2026-07-02 · timeline charter]** `createSpritesheetTimelineSource` moves to movieclip.
- **[2026-07-02 · timeline charter]** `timeline-spritesheet` package absorbed into movieclip.
- **[2026-07-02 · timeline charter]** Dependency direction: movieclip → timeline + types.

## Open directions

1. **`MovieClipSignals` exact shape.** Which clip-specific signals beyond timeline's? `onSourceChange`? Child-related?
2. **`updateMovieClip` recursion.** Does movieclip's wrapper add recursive child advance, or stay non-recursive like `updateTimeline`?
3. **Spritesheet bridging shape.** How does `createSpritesheetTimelineSource` interact with bitmap binding (`bindSpritesheetPlayerToBitmap` from spritesheet charter)?
