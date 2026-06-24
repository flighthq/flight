---
package: '@flighthq/timeline'
status: solid
score: 72
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/timeline.md
  - source
  - changes.patch
  - charter.md
---

# timeline — Review

Evidence: `incoming/builder-67dc46d64/head/packages/timeline/` (`src/timeline.ts`, `src/movieClip.ts`, `src/index.ts`, two `*.test.ts`), the new `@flighthq/types` files it declares, and `changes.patch`. Findings reference `67dc46d64:<path>`. This survey supersedes the prior `reviews/depth/timeline.md` (verdict `partial — 48/100`), which is now stale: the two defining gaps it named — frame scripts and a dead per-frame event lifecycle — have both been built in this bundle.

## Verdict

`solid — 72/100`. The package is now a working MovieClip timeline, not just a playback spine. The Bronze tier from the maturation roadmap landed in full: an armed per-frame event lifecycle (`enableTimelineSignals`/`enableMovieClipSignals` emitting `onExitFrame`→`onEnterFrame`→ `onFrameConstructed`), frame scripts firing on entry after construct, `loop`/`once` play modes with `onComplete`/`onLoop`, and current-label introspection. The clean three-way `TimelineSource` / `Timeline` / `MovieClip` split is intact and is still the package's strongest asset. The 72 (matching the worker's self-estimate, unusually) reflects this review's distance-to-authoritative bar: the entire Silver/Gold band (play ranges, reverse/speed, nested-clip propagation, scenes, the `-formats` neighbor, the Rust crate) is absent, a couple of small doc/code mismatches exist, and the charter is a stub so most of "what good means here" is assumed against the OpenFL/Lime target, not confirmed.

## Present capabilities (verified against source)

**Format seam** (`timeline.ts`). `createTimelineSource({ totalFrames?, frameRate?, labels?, constructFrame? })` builds the format-agnostic `TimelineSource` contract (`67dc46d64:timeline.ts:36`), defaulting to `totalFrames: 1`, `frameRate: null`, `EMPTY_LABELS`, and a `noopConstructFrame`. The `TimelineSource` interface in `@flighthq/types` documents the seek-safe / idempotent `constructFrame` invariant and explicitly notes the source may lazily cache per-target content so a source is shareable across clips. The spritesheet package's `createSpritesheetTimelineSource` is a confirmed second producer of this contract (`changes.patch` touches `spritesheet/.../spritesheetTimelineSource`).

**Playback state & timing** (`timeline.ts`). `createTimeline(obj?)` allocates the per-clip playhead (`currentFrame: 1`, `isPlaying: false`, `lastFrameUpdate: -1`, `playMode: 'loop'`, `frameScripts: null`, `signals: null`, `timeElapsed: 0`). `playTimeline`/`stopTimeline`/`updateTimeline(timeline, deltaTime)` form a fixed-timestep playhead; `playTimeline` short-circuits when `totalFrames < 2` (`67dc46d64:timeline.ts:96`). The frame-rate accumulator (`1000/frameRate`) and the null-frameRate "one frame per host update" mode both exist in `advanceFrame`, with multi-frame catch-up via `Math.floor(timeElapsed/frameTime)` (`67dc46d64:timeline.ts:138`).

**Per-frame event lifecycle (now armed — the headline fix)**. `enableTimelineSignals(timeline)` (`67dc46d64:timeline.ts:52`) is the opt-in `enable*` that both allocates the `TimelineSignals` group and arms emission, idempotent via `??=`. `fireConstructFrame` (`67dc46d64:timeline.ts:179`) emits `onExitFrame` (before `lastFrameUpdate` advances), `onEnterFrame` (after), then constructs the frame, fires the frame script, and emits `onFrameConstructed` — a deliberate, tested ordering (`timeline.test.ts:168`). `advanceFrame` emits `onLoop` on wrap and `onComplete` + `isPlaying = false` on `once`-mode end, in both the frameRate and null-frameRate paths. The prior depth review's central finding — "signals are dead fields nothing emits" — is resolved.

**Frame scripts** (`timeline.ts`). `addTimelineFrameScript(timeline, frame, script)`, `getTimelineFrameScript`, `removeTimelineFrameScript`, accepting a `number | string` frame (label strings resolved via `resolveFrame`). Scripts fire once on frame entry, after `constructFrame`, before `onFrameConstructed` (`67dc46d64:timeline.ts:192`). `removeTimelineFrameScript` nulls `frameScripts` when the last script is removed — keeps the common no-scripts path allocation-free. This unlocks the canonical `stop()`-on-frame pattern.

**Navigation & labels** (`timeline.ts`). `gotoAndPlayTimeline`, `gotoAndStopTimeline`, `nextFrameTimeline`, `prevFrameTimeline`, all routing through the private `seekTimeline` (clamps to `[1, totalFrames]`, resets `lastFrameUpdate` to force a re-construct). `findTimelineLabel` (by name) and the new `getTimelineCurrentLabel` (last label at/under the playhead) — `resolveFrame` throws on an unknown label name (treated as programmer error, consistent with the sentinel-vs-throw rule).

**MovieClip node** (`movieClip.ts`). `createMovieClip` (`MovieClipKind`, via `createDisplayObjectGeneric`), `createMovieClipData`/`createMovieClipRuntime` (the entity/runtime quartet), `setMovieClipSource` (binds source + target, realizes the first frame via `gotoAndStopTimeline` so the clip is not blank), and a full symmetric mirror of every timeline op (`playMovieClip`, `gotoAndStopMovieClip`, `getMovieClipCurrentFrame`, `getMovieClipTotalFrames`, `isMovieClipPlaying`, `updateMovieClip`, the frame-script trio, `getMovieClipCurrentLabel`). All clip-level wrappers are correctly no-op-safe when `timeline === null`. `enableMovieClipSignals` (`67dc46d64:movieClip.ts:61`) allocates the signals on the runtime tier (`movieClipSignals` slot) and arms the underlying timeline; `getMovieClipSignals` now returns `null` until enabled (was lazily allocating — the convention fix the depth review asked for).

**Types** (`@flighthq/types`). New one-concept-per-file additions land first in the header layer: `FrameScript.ts`, `PlayMode.ts`, `TimelineFrameEvent.ts`, `TimelineSignals.ts`; `Timeline.ts` gains `frameScripts`/`playMode`/`signals`; `MovieClipSignals.ts` is now a type alias for `TimelineSignals` (de-duplicated so the bare timeline and the clip share one signal shape). Good types-first hygiene.

**Tests.** 95 colocated tests confirmed (`timeline.test.ts` 50 `it`s, `movieClip.test.ts` 45), `describe` blocks alphabetized and mirroring exports 1:1. Coverage includes the signal emission order, `onLoop`/`onComplete`, `once`-mode stop, frame-script fire-once and label-string attach, and the multi-frame-skip catch-up case (`timeline.test.ts:472`).

## Gaps (vs the AAA MovieClip-timeline target; charter is a stub, so codebase-map standard applies)

- **No play ranges.** No `playTimelineRange(timeline, from, to, loop?)`, no label-delimited loop region, no `playRange` field. Sub-animation segments (a walk cycle inside a full character timeline) are not expressible. Roadmap Silver; status confirms deferred-no-consumer.
- **No reverse / playback speed.** `prevFrameTimeline` steps one frame while stopped, but there is no continuous reverse, no `direction: 1 | -1`, no `playbackRate` time-scale. `advanceFrame` already centralizes stepping and is the natural extension point. Roadmap Silver.
- **No nested-clip propagation.** `updateMovieClip` advances only the clip's own timeline; a real MovieClip tree advances `MovieClipKind` descendants when the parent advances. There is no `advanceMovieClipTree`. This is cross-package by nature (walking the hierarchy needs `@flighthq/node`, or the render/update pass owns it) — missing-by-design vs by-omission is still unresolved.
- **No scenes.** No `TimelineScene`, `gotoAndPlayTimelineScene`, `getTimelineCurrentScene`. AS3 multi-scene parity absent. Roadmap Silver.
- **No `@flighthq/timeline-formats` neighbor.** No keyframe-document JSON loader, no SWF/Adobe-Animate importer seam. The `TimelineSource` contract is exactly the seam such a package would feed; correctly deferred pending a `-formats` split decision (mirrors `spritesheet-formats`).
- **Incomplete signal lifecycle.** No `onPlay`/`onStop`/`onSeek`/`onScriptError`, no `onFrameLabel` fired on entering a labeled frame. A frame-script fault currently propagates as a throw rather than a sentinel `onScriptError` notification. Roadmap Gold.
- **Frame accounting under-specified.** Multi-frame catch-up (`Math.floor(timeElapsed/frameTime)`) jumps straight to the landing frame and constructs/fires scripts for _that frame only_ — the skipped frames' scripts and `onEnterFrame` never fire (verified: `timeline.test.ts:472` constructs `[…]` landing on frame 3 with no 2). Flash fires the landing frame only, so this matches, but it is undocumented and there is no `maxFrameSkip` clamp. Roadmap Gold.
- **No frame-script bulk authoring / enumeration.** No `getTimelineFrameScripts`, `clearTimelineFrameScripts`. Small. Roadmap Silver.
- **No goto-by-time / scrubbing.** No `getTimelineDuration(timeline)` (ms) or `seekTimelineToTime(timeline, ms)` for editor scrubbing. Roadmap Silver.
- **No Rust `flighthq-timeline` crate.** Charter front matter names `crate: flighthq-timeline`; no crate exists yet. Correctly Gold — should follow a Silver-stable TS surface.
- **No functional/parity coverage.** No `tests/functional/timeline-playback` scene; coverage is jsdom unit only. Roadmap Gold.

## Charter contradictions

None. The charter's only non-stub section is "What it is" (seeded from the prior depth review), and the code matches it exactly: a playhead engine over numbered frames, label navigation, a per-frame construct callback, and the explicit `TimelineSource` contract designed so any format can feed one engine. North star, Boundaries, Decisions, and Open directions are all `TODO`/empty, so there is no blessed rule to violate. The thinness is itself the finding — see candidate open directions.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated type words in every function (`getMovieClipTotalFrames`, not `getMcFrames`; `getTimelineCurrentLabel`); opt-in `enable*` groups defined in the owning package, not in `@flighthq/signals`, allocating _and_ arming emission (`enableTimelineSignals`/`enableMovieClipSignals`) — the exact convention the depth review flagged as violated, now satisfied; sentinel returns (`getTimelineFrameScript`/`getTimelineCurrentLabel` → `null`, clip wrappers no-op when `timeline === null`); throws reserved for programmer error (`resolveFrame` on an unknown label); types-first in `@flighthq/types`, one concept per file; single `.` export; `sideEffects: false`; deps limited to `displayobject`/`signals`/`types`. Runtime-slot discipline is correct — `movieClipSignals` hangs on `MovieClipRuntime`, not on the entity. Strong contract hygiene; this is the cleanest part of the package.

**Defects / candidate revisions:**

- **`TimelineSignals.ts` header comment over-claims.** The file comment states "All signals carry a TimelineFrameEvent payload" (`67dc46d64:types/src/TimelineSignals.ts`), but `onComplete` and `onLoop` are typed `Signal<() => void>` — they carry _no_ payload, and `advanceFrame` emits them with no argument. The three per-frame signals do carry the payload; the two terminal signals do not. The comment should say "the three per-frame signals carry a `TimelineFrameEvent`; `onComplete`/`onLoop` are bare." In-source doc fix, no signature change. (One could argue `onComplete`/`onLoop` _should_ carry the frame too — that is a small API-shape question, noted below.)
- **`MovieClipSignals` payload reshape is a public-API change.** `MovieClipSignals` was `Signal<() => void>` lifecycle signals and is now a type alias for `TimelineSignals` with typed payloads. Acceptable pre-release (status confirms no external consumers), but `npm run api` should be re-run to record the reshape. Not a defect — a flagged change.
- **`enableMovieClipSignals`-before-`setMovieClipSource` orphans a signal group.** When signals are enabled before a source is bound, a bare `Timeline` is created and armed; a later `setMovieClipSource` calls `enableTimelineSignals` on the (same) timeline and reassigns `runtime.movieClipSignals` (`67dc46d64:movieClip.ts:142`). Because `setMovieClipSource` reuses the existing `clip.data.timeline`, the group is the same and nothing is actually orphaned in that path — but the status doc claims an orphan "harmless" case, and the re-wire branch is dead-ish (it re-fetches the same already-armed group). Worth simplifying: the re-wire only matters if a _new_ timeline were created, which `setMovieClipSource` does not do when one exists. A correctness-neutral cleanup, not a bug.
- **`getTimelineCurrentLabel` does not assume sorted labels** (`67dc46d64:timeline.ts:62`) — it takes the max-frame label `<= currentFrame` via an explicit comparison rather than relying on label order. Defensive and correct; noting only that `TimelineLabel[]` order is otherwise unspecified, which is a latent contract question (are labels guaranteed sorted by frame?).
- **Package Map line is stale-ish.** The map says "MovieClip-style keyframe and timeline support" — accurate but now undersells what shipped (frame scripts, lifecycle signals, play modes). Minor; the charter "What it is" is the better description. Candidate revision for the map owner, not a defect.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** Likely: the `TimelineSource`/`Timeline`/`MovieClip` separation is inviolable (format never depends on engine), `constructFrame` is seek-safe/idempotent, all emission is opt-in and tree-shakes to zero, and Flash/OpenFL frame semantics are matched exactly (landing-frame-only on skip). Confirm so Silver/Gold work is judged against it.
2. **Nested-clip advancement ownership (cross-package).** Does `@flighthq/timeline` import `@flighthq/node` to walk and advance `MovieClipKind` descendants (`advanceMovieClipTree`), or does the render/update pass own recursive advance? The depth review and status both flag the current silence as ambiguous. Needs a Boundary decision before Silver.
3. **`@flighthq/timeline-formats` neighbor.** Approve/deny the `-formats` split (keyframe-document JSON loader + SWF/Animate importer seam) before building it. Mirrors `spritesheet-formats`; subject-triad plurality guard applies (build only with ≥2 formats in sight).
4. **`onComplete`/`onLoop` payload.** Should the two terminal signals carry the frame (or a small completion payload) like the three per-frame signals, or stay bare `Signal<() => void>`? Resolving this also fixes the `TimelineSignals.ts` comment.
5. **Frame-accounting policy.** Bless the landing-frame-only skip behavior explicitly and decide on a `maxFrameSkip` clamp + whether a fractional-frame interpolation hook (for tween-on-timeline) is in scope. Currently undocumented.
6. **Label ordering contract.** Are `TimelineSource.labels` guaranteed sorted by frame? `findTimelineLabel` and `getTimelineCurrentLabel` do not assume it; pinning the contract lets future range/scene code rely on order. (Coordinate with the types-layout owner.)
7. **Cross-engine signal parity.** Keep `onComplete`/`onLoop` names and semantics identical to `@flighthq/spritesheet`'s player (already established there) across both animation engines.

## Notes for status verification (as-claimed → verified)

The worker status doc checks out against the diff. Confirmed: 95 tests across 2 files; all listed new functions present and exported; the signal emission order (`exit`→`enter`→`constructed`) is real and tested; `playMode` `once`/`loop` with `onComplete`/`onLoop` is wired in both `advanceFrame` paths; `getMovieClipSignals` now returns `null` until `enableMovieClipSignals` (the convention fix); `createMovieClipSignals` is gone. The status's own concerns are accurate and worth keeping live: the `onComplete`-in-`advanceFrame` final-frame subtlety (the `frameRate: null` path returns `totalFrames` and lets the caller construct it — consistent with the frameRate path), the `MovieClipSignals` payload reshape, and the `enableMovieClipSignals`-before-source re-wire awkwardness (which this review found to be correctness-neutral but worth simplifying). The self-estimated 72 matches this review's distance-to-authoritative bar.
