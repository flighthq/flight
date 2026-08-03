# Timeline Cue Model

_Design spec. Settled with the user 2026-08-03, who blessed the model and delegated the open
rulings (marked **[delegated]** below) rather than deciding each one. The header has landed in
`@flighthq/types`; the dispatcher, the handlers, and the SWF migration are in flight. Read this
before adding anything that fires on frame entry, before giving an importer a `FrameScript`, or
before touching `swfFrameAction.ts`._

## Why this exists

A timeline had two seams and needed three.

`TimelineSource.constructFrame` is frame **content**, and its contract is explicit: _"Must be
seek-safe — jumping to any frame must produce that frame's state, and re-entering the same frame
must be idempotent."_ `Timeline.frameScripts` is the user's arbitrary per-clip **code**, an opaque
closure attached at runtime.

Neither can hold an authored cue. A sound is edge-triggered, not state: put it in `constructFrame`
and `gotoAndStop(12)` twice plays it twice, and scrubbing backwards through frame 12 fires it. A
`goto` moves the playhead, which is the definition of not seek-safe. So cues are not content.

They are frame-script *semantics* — fire once on entry, side-effecting — but they cannot be
`FrameScript`s either. An importer emitting closures takes a hard dependency on whatever subsystem
the cue drives (`media`, for audio), so parsing a SWF for its artwork would pull in the audio mixer.
Worse, a closure is not data: not serializable, not inspectable, not portable to the C/C++ port. You
cannot ask "what sounds does this document use?" without executing it.

The evidence that this was already the missing primitive is in `packages/swf/src/swfFrameAction.ts`.
The importer deliberately refuses to be an interpreter — _"AVM1 gives playback control its own
single-byte opcodes… This is deliberately not an interpreter, and the distinction is the whole
point"_ — recognizes a closed vocabulary into a plain `SwfFrameCommand` record, and then throws that
recognition away in `createSwfFrameScript` by closing over it. The module-global `_gotoDepth`
counter exists only because the closure form hid re-entrancy from the engine, forcing the importer
to bound goto recursion with shared mutable state from the outside.

## The model

`TimelineSource` gains a third member:

```ts
readonly cues: readonly TimelineCue[];
```

A `TimelineCue` is plain, kind-tagged data (`{ frame, kind }` plus per-kind fields). Kinds are open
plain strings dispatched through a registry, the same doctrine as renderer registration: a handler
registers against a kind, unregistered kinds are inert data that shakes out, and a user adds a
vendor-prefixed kind without touching the type.

The ownership line this draws:

| | lives on | shape | scope |
| --- | --- | --- | --- |
| frame content | `TimelineSource.constructFrame` | function, idempotent | shared by every clip |
| authored cues | `TimelineSource.cues` | plain data | shared by every clip |
| user scripts | `Timeline.frameScripts` | opaque closure | one clip |

**Importers emit zero closures.** Since the SWF importer already declines any frame body that is not
recognized playback commands, SWF import becomes pure data end to end.

Built-in kinds: `Audio`, `Goto`, `Play`, `Stop`, `NextFrame`, `PreviousFrame` — the last five
matching `SwfFrameCommand`'s vocabulary exactly, because that vocabulary was already right.

Handlers are held on a `TimelineCueRegistry` entity reachable from `Timeline.cueRegistry`, null
until a caller opts in. One registry is normally shared by every timeline in an application; it is
per-timeline to avoid module state, not to be built per clip. With no registry, a source's cues are
inert and every handling package shakes out — which is what keeps `media` out of a timeline that
only animates.

## Rulings

**[delegated] Re-entry policy is per-kind, declared at registration — not one global rule.** The two
built-in families genuinely differ, so no single policy can serve both. Playback cues set
`dispatchOnSeek: true`, because `gotoAndStop(1)` must run frame 1's `Stop` or the most common
authored idiom in existence breaks. Event audio sets it `false`, so scrubbing a timeline does not
machine-gun every sound it passes.

A handler is also handed the `TimelineFrameEntryCause` (`Advance` | `Seek`) so it can *react* to a
seek rather than only opt out of one. That third path is what a stream sound needs — resync to the
new position — and it is why the gate is a boolean plus a cause rather than a two-value enum.

**[delegated] A `Goto` cue does not abandon the rest of its frame.** Remaining cues on the current
frame still run, and the jump takes effect before the next advance. This is Flash's behavior, and it
is written down because it is exactly the kind of ordering that silently diverges between
implementations and is then discovered by a broken asset.

**`TimelineCue`, not `TimelineFrameEvent`.** That name was already taken by the payload of the
per-frame *signals* (`onEnterFrame` / `onExitFrame`), which reports that a frame boundary happened.
A cue is authored content carried by the source. "Cue" is also the canonical word — Unity Animation
Events, Spine events, and audio cue points all name this concept.

**The goto-recursion bound moves into the dispatcher.** `_gotoDepth` in `swfFrameAction.ts` is
deleted, not relocated: the engine owns the playhead, so the engine owns the bound, and no shared
module state is needed to express it.

## Deliberately out of scope

**Stream sounds** (SWF `SoundStreamHead`/`SoundStreamBlock`) are not modeled here. Their blocks are
sample-interleaved with frames, and in Flash the stream is the clock — the timeline drops frames to
stay in sync with audio, inverting `clock`'s normal ownership. The cue model carries the data fine
(one concatenated `AudioResource` plus a frame→sample offset map); whether a stream may drive the
clock is a separate decision and is not settled by this document.

## See also

- [document audio resources](document-audio-resources.md) — where the bytes a `TimelineAudioCue`
  points at come from.
