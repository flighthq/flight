---
package: '@flighthq/movieclip'
crate: flighthq-movieclip
draft: false
lastDirection: 2026-07-10
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

The display-object composition layer over `@flighthq/timeline`: a `MovieClip` is a `DisplayObject` whose frames a timeline drives, plus the bridges (spritesheet → `TimelineSource`) that feed it. The timeline engine stays pure and headless; movieclip is where it meets the scene graph. AAA target is OpenFL MovieClip parity — nested-clip playback, frame scripts, labels, goto/play/stop — expressed Flight-style (explicit, no hidden per-frame magic).

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

**Dependencies:** `timeline` + `displayobject` + `node` + `types`. (Corrected 2026-07-10: a `MovieClip` *is* a `DisplayObject`, so displayobject is a real value dependency, not types-only; the spritesheet bridge uses `node` + displayobject and only `Spritesheet`/`SpritesheetAnimation` *types* from `@flighthq/types`, so no `spritesheet` value dependency. `@flighthq/spritesheet` is a test-only devDependency for fixtures.)

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Extracted from timeline + spritesheet (behavior-preserving).** `@flighthq/movieclip` now exists as its own package (`849ada06`), holding the complete MovieClip node/playback wrapper (moved from `packages/timeline/src/movieClip.ts`) and `createSpritesheetTimelineSource` (moved from `packages/spritesheet/src/spritesheetTimelineSource.ts`). No behavior/signature change — pure relocation + registration. Deps corrected to the set above. This absorbs the planned `timeline-spritesheet` scope (that package will not be built).

- **[2026-07-10] Nested-clip advance is not `updateMovieClip` recursion — it hooks the existing update-before-render tree walk.** OpenFL leaves *when* a MovieClip advances to the implementer; Flight already walks every display object in the pre-render update pass, so making `updateMovieClip` recurse into children would duplicate that walk and hide work. Direction: keep `updateMovieClip(clip, dt)` non-recursive and explicit (advance one clip's own timeline), and add an **opt-in per-node advance hook driven by the existing tree walk** — a signal or callback each MovieClip node can register so it advances as the pre-render pass visits it. The implementer chooses manual `updateMovieClip` calls or the walk-driven hook; the engine never silently advances clips the caller didn't opt in. (Maturation item — not yet built; the extraction preserves the non-recursive-only behavior.)

### Origin decisions (from timeline charter)

- **[2026-07-02 · timeline charter]** Timeline/MovieClip split. MovieClip is the display-object composition layer.
- **[2026-07-02 · timeline charter]** `MovieClipSignals` is a separate interface, not an alias of `TimelineSignals`.
- **[2026-07-02 · timeline charter]** `createSpritesheetTimelineSource` moves to movieclip.
- **[2026-07-02 · timeline charter]** `timeline-spritesheet` package absorbed into movieclip.
- **[2026-07-02 · timeline charter]** Dependency direction: movieclip → timeline + types.

## Open directions (maturation — extraction is done; these are the AAA follow-ons)

1. **Walk-driven advance hook.** Implement the per-node advance hook from the 2026-07-10 decision: wire a signal/callback that the pre-render update-before-render tree walk fires per MovieClip so nested clips advance without a recursive `updateMovieClip` or manual per-clip calls. Touches the render/update pipeline + signals; the seam is the question.
2. **`MovieClipSignals` becomes a distinct interface.** Today `enableMovieClipSignals` returns `enableTimelineSignals(...)` and `MovieClipSignals` is a structural alias of `TimelineSignals`. Give it clip-specific signals (`onSourceChange`, and whatever the walk-hook needs) as a separate `@flighthq/types` interface.
3. **Spritesheet bridging shape.** How `createSpritesheetTimelineSource` should interact with bitmap binding (`bindSpritesheetPlayerToBitmap` from the spritesheet charter) — unify or keep distinct.
