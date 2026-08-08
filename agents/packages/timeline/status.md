---
package: '@flighthq/timeline'
updated: 2026-08-08
by: principal
---

# timeline — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/timeline/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session. The package is one source file, `timeline.ts`; `movieClip.ts`
now lives in the separate `movieclip` cell and its claims moved with it.

- **The cue dispatcher does not exist.** The header has landed and the data flows: `createTimeline`
  carries `cueRegistry` (`timeline.ts:26`) and `createTimelineSource` carries `cues` (`:52`). Nothing
  reads either — `fireConstructFrame` (`timeline.ts:218-237`) runs `constructFrame`, then the user's
  `frameScripts`, and stops. No `createTimelineCueRegistry`, no `registerTimelineCue`, no dispatch
  function anywhere in `packages/`, and `TimelineFrameEntryCause` has no consumer. The SWF importer
  already emits cues (`swf/src/swfDocument.ts:1984`), so every imported sound, `Goto`, and `Stop` is
  inert data today. This is the cell's blocking gap; the model is ratified in
  [timeline cue model](../../timeline-cue-model.md).
- **Playback is forward-only at the source's rate.** No `playbackRate`, `direction`,
  `reverseTimeline`, or ping-pong; `TimelinePlayMode` is `'loop' | 'once'`
  (`types/src/TimelinePlayMode.ts:3`).
- **No time-domain seek.** `seekTimeline` is module-private (`timeline.ts:254`), reachable only
  through `gotoAndPlayTimeline` / `gotoAndStopTimeline` / `nextFrameTimeline` / `prevFrameTimeline`.
  No `seekTimelineToTime`, no `getTimelineDuration` — editor scrubbing has no entry point.
- **No play ranges and no scenes.** `playTimelineRange`, `TimelineScene`, and
  `gotoAndPlayTimelineScene` exist nowhere, so a sub-animation inside a longer timeline cannot be
  addressed as a unit.
- **The signal set is five** (`timeline.ts:204-212`): `onComplete`, `onEnterFrame`, `onExitFrame`,
  `onFrameConstructed`, `onLoop`. No `onPlay`, `onStop`, `onSeek`, `onFrameLabel`, `onScriptError`.
- **Multi-frame skips visit only the landing frame** (`timeline.ts:161-166`, `:214-217`): scripts and
  enter/exit signals for the frames jumped over do not fire. Intentional and documented; whether a
  `maxFrameSkip` clamp or fractional-frame interpolation belongs here is an unmade policy decision.
- **No `@flighthq/timeline-formats` neighbor.** Sources come from `createTimelineSource`,
  `spritesheet`, or `swf`; there is no keyframe-document loader.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the parked item "fix the
  over-claiming `TimelineSignals.ts` header comment" — the comment already reads correctly
  (`types/src/TimelineSignals.ts:4-5`), so the cross-boundary edit it was waiting on is moot. Every
  `movieClip.ts` claim moved out to the `movieclip` cell, which now owns that source.
- **2026-07-31** — `updateTimeline` returns `true` only when a call realizes a new frame;
  `getTimelineFrameScriptFrames` and `clearTimelineFrameScripts` added; `getTimelineLabels` promoted
  to the public lane.
- **2026-06-25** — Correctness-neutral signal re-wire branch dropped from `setMovieClipSource`;
  landing-frame-only frame accounting pinned with durable comments in source.
- **2026-06-24** — Frame scripts, label lookup, `playMode` loop/once with `onComplete`/`onLoop`, and
  the lazily-armed `TimelineSignals` group landed; `MovieClipSignals` became an alias of it.
