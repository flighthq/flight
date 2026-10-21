# flight-timeline

Timeline playback: a per-timeline playhead over a shareable `TimelineSource`. The source owns what a
frame *is* (`constructFrame`, total frames, labels, authored cues, cadence); the timeline owns
*playback* (current frame, playing state, accumulated time, frame scripts, lifecycle signals).

- Frames are 1-based; `goto`/script/label arguments accept a number or a label name, and an unknown
  label throws `Frame label "<name>" not found`.
- Update is driven by an explicit `deltaTime` in milliseconds — no clock, scheduler or global state.
  A timed source advances before realizing the landing frame; a `frameRate`-null source realizes the
  current frame and then advances its next-call playhead. Multi-frame jumps construct only the
  landing frame (skipped frames' scripts/signals are not replayed), matching Flash/OpenFL.
- Lifecycle signals are opt-in (`enable_timeline_signals`) and emitted in source order: exit, store
  `lastFrameUpdate`, enter, construct, script, constructed.
- Frame scripts store `Arc` callbacks in insertion order; the store is `None` when empty.
- Cue types are data only here: `timeline.ts` does not dispatch cues, so no cue handling, audio
  playback or seek resync is implemented.

## Precision

`timeElapsed`, `deltaTime`, `frameRate`, and cue duration/offset/envelope times are `f64`
(milliseconds or seconds): they accumulate and are compared against frame times, so double precision
avoids drift that f32 cannot represent over long play sessions.
