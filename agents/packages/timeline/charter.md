---
package: '@flighthq/timeline'
crate: flighthq-timeline
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# timeline — Charter

## What it is

`@flighthq/timeline` is a **pure frame/time playback engine** — a playhead that advances through numbered frames at a frame rate, with labels, frame navigation (`gotoAndPlay`/`gotoAndStop`/`next`/`prev`), frame scripts, armed signal lifecycle, and configurable play modes. It owns the `Timeline` entity, the `TimelineSource` contract (so any format — hand-authored keyframes, spritesheet, future SWF — can feed the same engine), `TimelineSignals`, frame-script CRUD, and the advance/update loop.

It is **not** the MovieClip. The display-object-specific wrapper that consumes a timeline and drives a display object lives in `@flighthq/movieclip` — a separate package that composes timeline + display object + spritesheet bridging. Timeline is the bedrock primitive; MovieClip is a composition of it.

## North star

1. **Pure playback engine, zero scene-graph coupling.** Timeline has no display object dependency. It advances frames, fires signals, runs scripts, resolves labels. What happens with the current frame is the consumer's business.
2. **`TimelineSource` is the data seam.** Any format that can produce frame data plugs into the same engine. The engine does not know what kind of data it is playing — spritesheet frames, hand-authored keyframes, procedural generation. The source provides; the engine advances.
3. **Plain data, free functions, explicit allocation.** Timeline entities are value descriptors. Advance is driven by `updateTimeline(timeline, deltaTime)`. No hidden runtime magic. Signals are opt-in via `enableTimelineSignals`.
4. **Sentinels over throws.** `null` for no-match (label lookup, frame script lookup). Update returns whether the frame changed.
5. **Clock-driven.** Timeline consumes `@flighthq/clock` once it exists, replacing raw `deltaTime` with a clock-sourced time step. Pause/resume/speed are clock concerns.

## Boundaries

**In scope:**

- `Timeline` entity — playhead state: current frame, elapsed time, play mode, frame rate, labels, frame scripts, signals.
- `TimelineSource` contract — the data-provider interface any format implements.
- `TimelineSignals` — per-frame lifecycle signals (`onEnterFrame`, `onExitFrame`, `onFrameConstructed` with `TimelineFrameEvent` payload; `onComplete`, `onLoop` bare).
- Frame-script CRUD (`add`/`get`/`removeTimelineFrameScript`) with label-or-number addressing.
- Playback control: `gotoAndPlayTimeline`, `gotoAndStopTimeline`, `nextFrameTimeline`, `prevFrameTimeline`, `playTimeline`, `stopTimeline`.
- `updateTimeline` — non-recursive frame advance. Does not walk descendant clips; the caller's update pass owns recursion.
- Play modes: `loop`, `once` (current), with future direction/speed/ranges as open design.
- Clock consumption (`@flighthq/clock`) once the clock package exists.
- Signal teardown: `disposeTimelineSignals`.

**Non-goals:**

- Display object coupling — belongs in `@flighthq/movieclip`.
- Spritesheet bridging / `createSpritesheetTimelineSource` — belongs in `@flighthq/movieclip`.
- Nested-clip recursion — the caller's update pass owns recursive advance.
- Rendering — renderers consume display objects, not timelines.
- Multi-object sequencing beyond what `TimelineSource` composes — unclear if timeline or a higher-level orchestrator owns this.

## Decisions

- **[2026-07-02] Timeline/MovieClip split.** `@flighthq/timeline` is the pure frame engine with no display object dependency. `@flighthq/movieclip` is the display-object composition layer that wraps a timeline and drives a display object. This is a decomposition: timeline was bundling two primitives (a general playback engine and a display-object-specific consumer).

  **Why:** Timeline felt complex because it was silently bundling MovieClip's display-object concerns. The play ranges/reverse/speed discussion reinforced it — these are general playback capabilities, not MovieClip-specific.

- **[2026-07-02] `MovieClipSignals` is a separate interface, not an alias of `TimelineSignals`.** The current `type MovieClipSignals = TimelineSignals` is a smell. MovieClip may have clip-specific signals that timeline doesn't. The two types are independent.

  **Why:** An alias that collapses two conceptually different things into one prevents future divergence and hides the boundary.

- **[2026-07-02] Dependency direction.** `movieclip` → `timeline` + `types` (displayobject and spritesheet types-only). Timeline depends on nothing scene-graph-related.

  **Why:** Timeline is the bedrock; it must not know about display objects or spritesheets.

- **[2026-07-02] `createSpritesheetTimelineSource` moves to movieclip.** The spritesheet→timeline bridge drives a display object from spritesheet frames — that's movieclip's job, not timeline's.

  **Why:** This function bridges three packages (timeline + spritesheet + displayobject). MovieClip is the composition layer that owns that bridging.

- **[2026-07-02] `timeline-spritesheet` package absorbed into movieclip.** No separate package needed. MovieClip is the natural home for spritesheet↔timeline integration.

  **Why:** Avoids an extra package when movieclip already bridges these concerns.

- **[2026-07-02] `updateTimeline` does not recurse.** The caller's update pass owns nested-clip advance, not the timeline engine. This matches the ported design.

  **Why:** Recursion into descendants would require importing the scene graph, violating timeline's zero-coupling principle.

- **[2026-07-02] Clock integration.** Timeline adopts `@flighthq/clock` once it exists.

  **Why:** `@flighthq/clock` is the shared time primitive. Timeline playback is a time-driven system — pause/resume/speed are clock concerns.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Signal payloads on `onComplete`/`onLoop`.** Currently bare `() => void`. Should they carry a `{ frame }` payload for convenience? Decide once, deliberately.

2. **`updateMovieClip` recursion behavior.** `updateTimeline` doesn't recurse. Does `updateMovieClip` also stay non-recursive, or does movieclip's wrapper add recursive child advance? Worth thought.

3. **Frame-skip policy.** Landing-frame-only (Flash behavior) is the current contract — catch-up via `Math.floor(timeElapsed/frameTime)` jumps to the landing frame, skipped frames' scripts/signals are silent. Frame skip has consequences for code execution (scripts on skipped frames never run). Should there be a `maxFrameSkip` clamp or a `skipPolicy` option?

4. **Play ranges / reverse / speed.** Label-delimited loop regions, reverse playback direction, and speed control are natural timeline-level primitives. Design TBD — these extend `advanceFrame` with frame-behavior the current engine doesn't have.

5. **`MovieClipSignals` exact shape.** Which clip-specific signals beyond timeline's? `onSourceChange`? Child-related? Design deferred until movieclip package is scoped.

6. **Package description update.** The Package Map line for timeline still says "MovieClip-style keyframes." Needs updating to reflect the pure-engine identity after the split.

7. **`@flighthq/movieclip` charter.** The new package needs its own charter — identity, boundaries, signal shape, spritesheet bridging, dependency model. Sequenced after timeline's direction lands.
