---
package: '@flighthq/timeline'
updated: 2026-06-24
basedOn: ./review.md
---

# timeline — Assessment

Sorted from `review.md` (score `solid — 72`). The Bronze tier from the prior `reviews/maturation/depth/timeline.md` roadmap has **already landed in this bundle** (armed event lifecycle, frame scripts, loop/once + `onComplete`/`onLoop`, current-label introspection), so that seed is absorbed and superseded — only its Silver/Gold band remains as candidate work. The charter is still a stub (North star / Boundaries / Decisions all `TODO`), so most of the remaining Silver/Gold work turns on open design questions, which keeps `Recommended` deliberately small: the genuinely sweep-safe items are two in-source doc fixes and one correctness-neutral cleanup. Every feature item in the Silver/Gold band either crosses a package boundary (`timeline-formats`, nested-clip propagation, the Rust crate) or needs a charter Boundary/North-star ruling (play ranges, reverse/speed semantics, frame-accounting policy), so it is routed to the charter's Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/timeline` (and its own `@flighthq/types` files), no cross-package coupling, no breaking change, no open design decision.

- **Fix the over-claiming `TimelineSignals.ts` header comment.** The file comment states "All signals carry a TimelineFrameEvent payload," but `onComplete` and `onLoop` are `Signal<() => void>` and are emitted with no argument (`advanceFrame`). Reword to "the three per-frame signals carry a `TimelineFrameEvent`; `onComplete`/`onLoop` are bare." Pure in-source doc fix, no signature change. (Whether the two terminal signals _should_ carry a payload is a separate API-shape question — routed to Open directions, not bundled into this fix.) — review.md (Contract & docs fit, defect 1).

- **Simplify the `setMovieClipSource` signal re-wire branch.** `setMovieClipSource` reuses the existing `clip.data.timeline`, so the `if (runtime.movieClipSignals !== null) { … enableTimelineSignals(…) }` branch re-fetches the same already-armed group and reassigns it to itself — correctness-neutral but dead-ish. Either drop the branch (the timeline is the same object; signals stay armed) or add a comment pinning _why_ it is needed. Within-package cleanup, no behavior change. — review.md (Contract & docs fit, defect 3).

- **Document the multi-frame-skip frame-accounting behavior in source.** Catch-up (`Math.floor(timeElapsed/frameTime)`) jumps to the landing frame and constructs/fires scripts for _that frame only_ (skipped frames' `onEnterFrame`/scripts do not fire). This matches Flash and is already covered by a test (`timeline.test.ts:472`), but it is undocumented. Add a durable semantic comment on `advanceFrame`/`fireConstructFrame` stating the landing-frame-only contract. A `maxFrameSkip` clamp and a fractional-frame hook are _not_ part of this item — they are a policy decision (Open directions). Documentation only, no behavior change. — review.md (Gaps: "Frame accounting under-specified").

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Play ranges** (`playTimelineRange(timeline, from, to, loop?)`, label-delimited loop regions, a `playRange` field on `Timeline`). **Parked:** within-package in code, but introduces new playback semantics (range vs. full-timeline looping, label-region binding) that the stub charter has not ruled on — an API-shape decision, not a sweep. Routed to Open directions (North star / playback semantics).

- **Reverse / playback direction + speed** (`direction: 1 | -1`, `playbackRate`, `setTimelineDirection`, `setTimelinePlaybackRate`, `reverseTimeline`, continuous reverse). **Parked:** extends `advanceFrame` with new semantics (sub-1.0 rates holding a frame, negative rates, ping-pong) that need a North-star ruling on exact frame behavior. Routed to Open directions.

- **Nested-clip propagation** (`advanceMovieClipTree(clip, deltaTime)` recursing `MovieClipKind` descendants). **Parked:** cross-package and an unresolved ownership boundary — does `timeline` import `@flighthq/node` to walk the hierarchy, or does the render/update pass own recursive advance? The depth review and status both flag the silence. Touches `@flighthq/node` and `@flighthq/render`. Routed to Open directions.

- **`@flighthq/timeline-formats` neighbor** (keyframe-document JSON loader `createTimelineSourceFromDocument`, SWF/Adobe-Animate importer seam). **Parked:** cross-package (new triad cell). Per the subject-triad **plurality guard**, create the `-formats` cell only with ≥2 formats actually in sight — confirm the split before building. Mirrors `spritesheet-formats`. Routed to Open directions.

- **Scenes** (`TimelineScene`, `gotoAndPlayTimelineScene`, `getTimelineCurrentScene`, `getTimelineScenes`). **Parked:** AS3 multi-scene parity adds a new structural concept to `TimelineSource` (scene ranges/labels) — a charter scope decision, larger than a sweep. Routed to Open directions.

- **`onComplete`/`onLoop` payload decision.** Should the two terminal signals carry the frame (or a completion payload) like the three per-frame signals? **Parked:** an API-shape decision that also resolves the `TimelineSignals.ts` comment; coordinate with the cross-engine signal-parity question (keep names/semantics identical to `@flighthq/spritesheet`'s player). Routed to Open directions.

- **Extended signal lifecycle** (`onPlay`, `onStop`, `onSeek`, `onScriptError`, `onFrameLabel`). **Parked:** Gold-tier; `onScriptError` in particular requires deciding the frame-script fault policy (sentinel-return vs. the current throw), a North-star ruling. Routed to Open directions.

- **Frame-script bulk authoring / enumeration** (`getTimelineFrameScripts`, `clearTimelineFrameScripts`, label-keyed attach). **Parked:** small and within-package, but bundled with the frame-script surface decisions; low-value on its own, fold in when play ranges / scenes are decided. Larger than a doc sweep.

- **Goto-by-time / scrubbing** (`getTimelineDuration(timeline)`, `seekTimelineToTime(timeline, ms)`). **Parked:** within-package, but introduces a time→frame mapping contract (and interacts with `playbackRate`) the charter has not ruled on. Routed to Open directions (frame-accounting policy).

- **`flighthq-timeline` Rust crate (1:1 conformance).** **Parked:** cross-worktree (the Rust port) and explicitly should not start until the TS surface is Silver-stable. The charter names the crate; the port owns the work.

- **Functional / parity coverage** (`tests/functional/timeline-playback` across Canvas/DOM/WebGL via the `functional-test` skill). **Parked:** requires the `functional-test` skill and a stable surface; belongs to the visual-test suite, not a within-package unit sweep. Gold-tier gate.

- **Package Map line refresh** ("MovieClip-style keyframe and timeline support" undersells the shipped frame-scripts / lifecycle-signals / play-modes surface). **Parked:** the line lives in `tools/agents/docs/index.md`, owned by the map owner, not within `@flighthq/timeline`.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). These are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar: the `TimelineSource`/`Timeline`/`MovieClip` separation is inviolable, `constructFrame` is seek-safe/idempotent, all emission opt-in and tree-shaking to zero, and Flash/OpenFL frame semantics (landing-frame-only on skip) matched exactly.
2. **Nested-clip advancement ownership** (cross-package) — does `@flighthq/timeline` import `@flighthq/node` to advance `MovieClipKind` descendants, or does the render/update pass own it? Resolve the missing-by-design vs by-omission ambiguity before Silver.
3. **`@flighthq/timeline-formats` neighbor** — approve/deny the `-formats` split (keyframe-document + SWF/Animate importer seam); apply the subject-triad plurality guard (≥2 formats before splitting).
4. **`onComplete`/`onLoop` payload** — frame-carrying like the per-frame signals, or bare? Resolving this also fixes the `TimelineSignals.ts` comment; coordinate with cross-engine signal parity vs. `@flighthq/spritesheet`.
5. **Frame-accounting policy** — bless landing-frame-only skip, decide a `maxFrameSkip` clamp and whether a fractional-frame interpolation hook (tween-on-timeline) is in scope.
6. **Playback semantics** — play ranges (range vs. full-timeline looping, label-region binding) and reverse/speed (sub-1.0 rates, negative rates, ping-pong) need exact frame-behavior rulings.
7. **Label ordering contract** — are `TimelineSource.labels` guaranteed sorted by frame? Pin the contract (coordinate with the types-layout owner) so range/scene code can rely on it.
