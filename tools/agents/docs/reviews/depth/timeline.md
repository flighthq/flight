# Depth Review: @flighthq/timeline

**Domain:** MovieClip-style frame timeline playback — a playhead engine that advances through numbered frames at a frame rate, supports labels and frame navigation (`gotoAndPlay`/`gotoAndStop`/`next`/`prev`), and drives a display object via a per-frame "construct" callback. This is the Flash/OpenFL MovieClip + Timeline model, redesigned around an explicit `TimelineSource` contract so any format (hand-authored keyframes, spritesheet, future SWF importer) can feed the same engine.

**Verdict:** partial — **48/100**

The package has a clean, well-factored core: a format-agnostic `TimelineSource` seam, a per-clip playback `Timeline`, and a `MovieClip` display node that wires them together. The playback primitives that exist are correct and the source/playback split is a genuinely good design. But measured against a mature MovieClip timeline library (the OpenFL/Flash feature target this package explicitly claims), several first-class, expected capabilities are simply absent — most notably frame scripts, the entire per-frame event lifecycle (the signals exist as dead fields that nothing ever emits), and loop/play-range control. It is a solid playback spine, not yet an authoritative timeline library.

## Present capabilities

- **Format seam.** `createTimelineSource({ totalFrames, frameRate, labels, constructFrame })` is the native authoring entry; `TimelineSource` is a clean contract (`totalFrames`, `frameRate`, `labels`, `constructFrame(target, frame)`) shareable across many clips. The `constructFrame` contract is documented as seek-safe and idempotent, which is the right invariant for random-access `gotoAndStop`.
- **Playback state.** `createTimeline` holds `currentFrame`, `isPlaying`, `timeElapsed`, `lastFrameUpdate`; `playTimeline`/`stopTimeline`/`updateTimeline(timeline, deltaTime)` form a correct fixed-timestep playhead. Frame-rate accumulator advancing (`1000/frameRate`) and a null-frameRate "one frame per update" mode both exist and loop at `totalFrames`.
- **Navigation.** `gotoAndPlayTimeline`, `gotoAndStopTimeline`, `nextFrameTimeline`, `prevFrameTimeline`, with `frame: number | string` resolution against labels.
- **Labels.** `findTimelineLabel` + label-name resolution in goto/seek. `resolveFrame` throws on an unknown label name (treated as programmer error).
- **MovieClip node.** `createMovieClip` (a real `DisplayObjectKind`-style node, `MovieClipKind`), `setMovieClipSource` (binds source + target and realizes the first frame so the clip is not blank before play), and the full mirror of timeline ops at the clip level (`playMovieClip`, `gotoAndStopMovieClip`, `getMovieClipCurrentFrame`, `getMovieClipTotalFrames`, `isMovieClipPlaying`, `updateMovieClip`, etc.). Clip-level wrappers are correctly no-op-safe when `timeline === null`.
- **Entity/runtime/signals quartet.** `createMovieClipData`/`createMovieClipRuntime`/ `createMovieClipSignals` follow the codebase's entity+runtime+lazy-signals pattern, with `getMovieClipSignals` lazily allocating the signal group on the runtime.

## Gaps vs an authoritative timeline library

- **Frame scripts / per-frame actions (missing-by-omission, the biggest gap).** A defining MovieClip feature is attaching code to a frame (`addFrameScript` in OpenFL/AS3; frame actions in Flash). There is no `addFrameScript`/`removeFrameScript`, no notion of frame actions firing on entry. `constructFrame` builds visual state only; there is no hook for "run this when frame N is entered." Without it the engine cannot express the canonical `stop()` on a frame, looping a sub-range, or jumping based on a frame's own logic — the bread-and-butter of timeline authoring.
- **The event lifecycle is declared but dead (missing-by-omission, confirmed bug-adjacent).** `MovieClipSignals` defines `onEnterFrame`, `onExitFrame`, `onFrameConstructed`, and `createMovieClipSignals` allocates them — but a repository search shows **nothing in the package ever emits them**. `updateTimeline`/`updateMovieClip` never call `emitSignal`. So the entire per-frame event surface (ENTER_FRAME / EXIT_FRAME / FRAME_CONSTRUCTED, core to MovieClip) is non-functional. There is also no `enableMovieClipSignals` opt-in function as the codebase convention prescribes; signals are lazily created on first `getMovieClipSignals` access and then never fired.
- **No loop / play-mode control (missing-by-omission).** Looping is hardwired (always wraps at `totalFrames`). There is no `loop` flag, no `playOnce`/`PlayMode`, no `gotoAndPlay` to a range, and no way to stop automatically at the end. A mature library exposes loop-vs-once and an optional end frame.
- **No play range / scene support (missing, arguably by-design for now).** No `playTimeline(from, to)`, no scenes (`gotoAndPlay(frame, scene)` in AS3). Labels exist but cannot delimit a playable range or a loop region.
- **No reverse / playback direction or speed (missing-by-omission).** `prevFrame` steps one frame while stopped, but there is no continuous reverse playback, no `playbackRate`/time-scale multiplier. Frame rate is fixed from the source.
- **No frame-label introspection beyond lookup (minor).** `findTimelineLabel` by name exists, but no `getTimelineCurrentLabel` (current label under the playhead) and no enumeration helper — both standard on `MovieClip.currentLabel` / `currentLabels`.
- **No nested-clip / child timeline propagation (missing, cross-package by nature).** A real MovieClip tree advances child MovieClips when the parent advances. `updateMovieClip` updates only the clip's own timeline; there is no recursive advance of MovieClip descendants. This may legitimately belong to the render/update pass rather than here, but the capability is absent and unmentioned.
- **No completion signal at the source level.** Notably, sibling `@flighthq/spritesheet`'s player _does_ emit `onComplete`/`onLoop`; the timeline engine has no equivalent loop/complete notification even though its signal struct gestures at the lifecycle.

## Naming / API-shape notes

- Naming is consistent and self-identifying: full type words in every function name (`getMovieClipTotalFrames`, not `getMcFrames`), the `Timeline`/`MovieClip` dual surface is symmetric, and the format seam (`createTimelineSource`) is named in parallel with `createSpritesheetTimelineSource`. Good.
- The `Timeline`/`TimelineSource`/`MovieClip` three-way split is the strongest design decision in the package and is well documented in `@flighthq/types`. Playback state lives per-clip; `totalFrames`/ `frameRate`/`labels` are read from the shareable source, not duplicated. This is exactly the kind of explicit-data, no-hidden-runtime shape the codebase asks for.
- The signals are the one API-shape miss. Per the codebase convention, an opt-in `enableMovieClipSignals` in this package should both create _and_ arm emission. As written, `getMovieClipSignals` allocates a group that can never fire — the surface advertises an event model the engine does not implement.
- `updateTimeline` fires `constructFrame` once per frame change via the `lastFrameUpdate` guard, which is correct, but the split "advance before construct for frameRate, after for null-frameRate" is subtle and is the natural place frame-script/event emission would slot in.

## Recommendation

Treat this as a solid spine that is two features short of authoritative. Priorities, in order:

1. **Wire the event lifecycle.** Either emit `onEnterFrame`/`onExitFrame`/`onFrameConstructed` from `updateTimeline`/`updateMovieClip` and seek, or remove the dead signal fields. Add an `enableMovieClipSignals` opt-in that arms emission, matching the codebase convention. A declared-but- never-fired event surface is worse than none.
2. **Add frame scripts.** `addFrameScript(clip/timeline, frame, fn)` / `removeFrameScript`, fired on frame entry. This unlocks `stop()`-on-frame, sub-range loops, and is the single feature most associated with "MovieClip timeline."
3. **Add loop/play-mode control:** a `loop` flag (or `PlayMode`), `playTimeline(from?, to?)` range play, and auto-stop at end with a completion signal — bringing it level with the spritesheet player's `onComplete`/`onLoop`.
4. **Add `getTimelineCurrentLabel`/current-labels introspection** (cheap, expected).
5. **Decide and document nested-clip advancement** — either implement recursive child-MovieClip advance here or state explicitly that it is the update pass's responsibility (missing-by-design vs by-omission should not be ambiguous).

With (1)–(3) this moves to "solid"; with the full set it becomes an authoritative MovieClip timeline library.
