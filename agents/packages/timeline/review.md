---
package: '@flighthq/timeline'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - assessment.md (prior, 2026-07-02)
  - review.md (prior merge-gate, 2026-06-25)
  - source (packages/timeline/src — timeline.ts, timeline.test.ts, index.ts)
  - packages/timeline/package.json
  - '@flighthq/types (Timeline, TimelineSource, TimelineSignals, TimelineFrameEvent, FrameScript, TimelinePlayMode, PlayMode, TimelineLabel)'
  - git log (packages/timeline, packages/movieclip)
---

# timeline — Review

## Verdict

`solid — 68/100`. The prior 38 was a merge-gate rejection whose sole blocking cause — the missing `@flighthq/types` half — is fixed: `Timeline` now declares `frameScripts`/`playMode`/`signals`, and `TimelineSignals`/`TimelineFrameEvent`/`FrameScript`/`TimelinePlayMode` all exist and are barrel-exported. The package is now what the charter asks for: a pure, headless frame engine (deps: `signals` + `types` only) with an opt-in signal lifecycle, frame scripts, loop/once modes, label navigation, and a clean `TimelineSource` seam — well-commented and fully tested. What keeps it out of the 80s is playback depth (no reverse/speed/ranges/ping-pong, no time addressing) plus one small North-star contradiction (`updateTimeline` returns `void`).

**Continuity note:** the movieclip extraction the old assessment's Backlog led with **has happened** — commit `75c4076b` (2026-07-09) moved `movieClip.ts` to `packages/movieclip` and `createSpritesheetTimelineSource` out of spritesheet; `packages/timeline/src` is now just `timeline.ts` + test + barrel. All three Approved sweep items (2026-07-02) also landed: `disposeTimelineSignals` (timeline.ts:49), the `setMovieClipSource` dead re-wire branch replaced by a durable comment (now in movieclip), and the frame-skip landing-frame-only contract documented on `advanceFrame` and `fireConstructFrame`.

## Present capabilities (grounded in source)

- **Entity + source constructors** — `createTimeline` (defaults: frame 1, stopped, `playMode: 'loop'`, `frameScripts`/`signals` null, `lastFrameUpdate: -1`) and `createTimelineSource` (the native authoring "format": totalFrames/frameRate/labels/constructFrame with a shared `EMPTY_LABELS` and noop defaults).
- **Advance loop** — `updateTimeline(timeline, deltaTime)`: frame-rate-driven catch-up (`floor(timeElapsed / frameTime)` landing-frame jump, remainder kept) or one-frame-per-update when `frameRate === null`; `fireConstructFrame` realizes exactly one frame per change with the signal order onExitFrame → onEnterFrame → `source.constructFrame` → frame script → onFrameConstructed, all gated on `signals !== null` so a non-signal timeline pays nothing.
- **Play modes** — `loop` (wrap + `onLoop`, correct multi-wrap modulo `((next - 1) % totalFrames) + 1`) and `once` (clamp at `totalFrames`, stop, `onComplete`), in both clock paths.
- **Playback control** — `playTimeline`/`stopTimeline`, `gotoAndPlayTimeline`/`gotoAndStopTimeline` (label-or-number via `resolveFrame`, clamped seek that re-realizes the frame), `nextFrameTimeline`/`prevFrameTimeline`.
- **Labels** — `findTimelineLabel` (null sentinel) and `getTimelineCurrentLabel` (last label at/before the playhead, null sentinel).
- **Frame scripts** — `addTimelineFrameScript`/`getTimelineFrameScript`/`removeTimelineFrameScript` over a lazily-allocated `Map`, cleared back to `null` when emptied; scripts fire once on frame entry, not on stopped re-updates (tested).
- **Signals lifecycle** — `enableTimelineSignals` (idempotent, `??=`) paired with `disposeTimelineSignals` (clears to null; re-arm tested).
- **Tests** — all 16 exports have alphabetized `describe` blocks in `timeline.test.ts`, including catch-up frame skip, wrap, once-mode stop, signal ordering, and dispose/re-arm.

## Gaps (vs a mature timeline engine — games, motion design, creative tools)

- **No direction or speed.** No `direction: 1 | -1`, no `playbackRate`, no reverse playback. Every mature timeline runtime (GSAP, Animate, game frame-animation systems) has timeScale/reverse; charter parks these as open design.
- **No play ranges.** No label-delimited segment playback (walk cycle inside a longer strip) — the single most-requested game-animation feature over loop/once.
- **No ping-pong mode.** `TimelinePlayMode` is `'loop' | 'once'` only.
- **No time addressing.** No `getTimelineDuration`, no seek-by-milliseconds, no normalized progress query — motion-design and editor scrubbing think in time, not frames. Frames are the only coordinate.
- **`updateTimeline` returns `void`**, so a caller cannot cheaply observe "did the frame change" without signals (see Charter contradictions).
- **Clock-mode asymmetry.** In the `frameRate !== null` path, advance happens *before* construct (so `currentFrame` equals the realized frame after an update); in the `frameRate === null` path, construct happens first and *then* the playhead advances, so between updates `currentFrame` reads one ahead of the frame actually realized (`lastFrameUpdate`). Deliberate (it lets frame 1 realize on the first update) but an observable inconsistency in what `currentFrame` means across the two clock modes; undocumented.
- **Label-not-found throws.** `resolveFrame` throws `Error('Frame label "…" not found')` from inside `gotoAndPlayTimeline`/`gotoAndStopTimeline`/`addTimelineFrameScript` — a message baked into core, with no guard module or `explain*` query per the diagnostics inversion rule. The lookup functions themselves sentinel correctly.
- **No bulk frame-script operations** (enumerate, clear-all) and one script per frame (`Map<number, FrameScript>`), matching Flash but below creative-tool expectations.
- **No signals for play/stop/seek** and no label-entered signal; `onComplete`/`onLoop` are bare (charter open direction 1).
- **No clock integration.** North star 5 says timeline consumes `@flighthq/clock` once it exists — `@flighthq/clock` now exists (Package Map), so this is unblocked, not blocked.
- **No `flighthq-timeline` Rust crate** (global TS-first posture; expected).

## Charter contradictions

- **North star 4 states "Update returns whether the frame changed" — `updateTimeline` returns `void`** (timeline.ts:120). The tests observe frame changes only via constructFrame callbacks or signals. Small, but a stated principle the code does not meet.
- Borderline: North star 4's "sentinels over throws … label lookup" is honored by `findTimelineLabel`, but goto-by-unknown-label throws via `resolveFrame`. Defensible as a programmer-error throw; the charter does not explicitly rule the goto case, so this is a tension to settle, not a clean violation.
- Otherwise clean: zero scene-graph value dependency (package.json deps are `signals` + `types` only), non-recursive `updateTimeline`, `TimelineSource` as the data seam — all as decided.

## Contract & docs fit

- **Types-first: fixed.** The prior review's blocking defects are gone — all timeline types live in `@flighthq/types` with good durable comments and barrel exports.
- Contract hygiene otherwise strong: full unabbreviated names, `get*`/`find*` verbs, null sentinels, single root export, `sideEffects: false`, colocated alphabetized tests, module constants at file bottom.
- **Candidate revisions (docs/admin, user's gate):**
  - `@flighthq/types` still exports an orphaned `PlayMode` (`'loop' | 'once'`) alongside the used `TimelinePlayMode` — a stale duplicate from the pre-rename pass, referenced nowhere outside types itself. Cross-package cleanup candidate.
  - Charter Open directions 6 ("Package Map line still says MovieClip-style keyframes") and 7 ("movieclip needs a charter") are both **resolved** — the Package Map now reads "timeline frame engine — keyframes, labels, frame scripts" with a separate movieclip line, and the movieclip charter exists (lastDirection 2026-07-10). Candidates for pruning at the next direction session.
  - `status.md` front matter says `updated: 2026-06-24` while its newest entry is 2026-06-25, and neither mentions the 2026-07-09 extraction — stale continuity.
  - Type-level scene-graph vocabulary: `Timeline.target` and `TimelineSource.constructFrame` are typed against `DisplayObject`, and `FrameScript` takes a `DisplayObject`. Value-level purity holds, but the header couples the engine's contract to the display-object family rather than a graph-feature alias.

## Candidate open directions

1. Should `Timeline.target`/`constructFrame`/`FrameScript` be typed against a graph-feature alias (or generic) instead of `DisplayObject`, so a future non-display consumer can drive the pure engine? The charter's "zero scene-graph coupling" is silent on type-level vocabulary.
2. Goto-with-unknown-label: throw (current), silent sentinel + `enableTimelineGuards` warning, or return-boolean? North star 4 leans sentinel; decide once.
3. The frameRate-null ordering: is "`currentFrame` may read one ahead of the realized frame between updates" the contract, or should both clock paths converge on advance-then-construct with a first-update exception?
4. Clock integration shape now that `@flighthq/clock` exists: does `updateTimeline` take a `Clock`, or does the caller keep passing scaled `deltaTime`?
