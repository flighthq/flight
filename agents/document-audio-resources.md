# Document Audio Resources

_Design spec. Settled with the user 2026-08-03. The header has landed in `@flighthq/types`; the
`audio` constructors/resolver, the `scene2d-resources` load pass, and SWF `DefineSound` recovery are
in flight. Read this before adding a non-pixel byte payload to a document, or before deciding where
an imported sound goes._

## The question

Does audio belong on `Scene2DDocument`, and what happens when you load a SWF with embedded sound?

## The answer

The **bytes** belong on the document. The **playback** does not.

`Scene2DDocument` is "a static, renderer-neutral named-graph document" whose sidecar arrays are
"the document's enumerable contracts, split by what resolving one produces." Audio fits that
framing exactly — a carried-or-named byte payload that parse cannot decode synchronously — so it
becomes a third array on precisely the image lane's terms:

```ts
audioResources: AudioResourceReference[];
```

`AudioResourceReference` mirrors `ImageResourceReference` member for member: an
`Embedded` | `External` union, a `ResourceResolutionState` the resolver advances, a
serialization-safe `failure` record, and — the load-bearing part — a list of the **sinks waiting on
it**. Loading one reference fills every `AudioResource` it names, so a sound cued from forty frames
decodes once and all forty cues are wired the moment it resolves. That is the same property that
makes a bitmap placed a hundred times cost one decode.

What does **not** go on the document is anything from `@flighthq/media`: no `AudioChannel`, no mixer
reference, no play-on-load flag. That would make a parse-time data structure carry running state and
act on it — the `displayObject.filters` anti-goal in a different costume. A document stays static.

## Why the sinks are held directly

A cue holds its `AudioResource` entity, not a name or an id. The importer creates the empty
resource, wires it into every cue that references it, and lists it on the reference; decode fills
the buffer and every cue is live at once. No name table, no lookup, no resolution order to get
wrong — exactly how a `Texture` waits for its `Image`.

This is also why `AudioResourceReference.resources` is named for its sink type rather than mirroring
`ImageResourceReference.textures` literally. For images the sink type (`Texture`) differs from the
resource type; for audio they are the same type, so reusing the document's `audioResources` field
name for the sink list would collide confusingly with the reference list.

## Where a SWF's sound ends up

`DefineSound` payloads become `EmbeddedAudioResourceReference`s on the document. `StartSound` is a
frame trigger, not a resource, and becomes a `TimelineAudioCue` on the `TimelineSource` — see the
[timeline cue model](timeline-cue-model.md). Nothing plays until a caller registers a handler.

Before this, the SWF importer read no sound tags at all and dropped them silently. By the
diagnostics doctrine that is a missing seam: a document whose audio was discarded must be reportable
through `importdiagnostics` rather than vanishing.

## Not SWF-specific

Lottie audio layers are a declared exclusion in
[scene2d format coverage](scene2d-format-coverage.md), and glTF has `KHR_audio_emitter`.
`ImageResourceReference` was built dimension-neutral for exactly this reason even though only
`Scene2DDocument` consumes it today; `AudioResourceReference` is neutral on the same terms, so a 3D
scene with positional audio carries the same references and differs only in how it discovers them.

## Known rough edge

`createScene2DDocument` is now six positional parameters, four of them optional with defaults, so
reaching `audioResources` means passing `null, null, []` past the ones you do not care about. That
shape was already strained at five and this made it worse. Converting it to a single options object
is the obvious fix, but it touches every importer call site and was deliberately kept out of this
change rather than bundled into it. Flagged for a separate pass.
