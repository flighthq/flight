# SWF Video Import Proposal

_Investigation proposal, 2026-08-04. No implementation is authorized by this record. In particular,
this does not change `@flighthq/video`, `Scene2DDocument`, or the SWF tag-coverage decision._

## Recommendation

Do not describe SWF video payloads as supported, and do not pass their bytes to the existing
`@flighthq/video` Blob loader. The payload is a timeline-indexed sequence of codec packets, not a
browser-playable video file. Loading those packets as though they were MP4, WebM, or Ogg would be a false
implementation.

If the measured graph divergence is worth closing, the smallest honest change is **structural support
only**:

1. retain `DefineVideoStream` as a real definition rather than only as an entry in the bounds table;
2. instantiate every placement of that definition, named or unnamed, as a `Sprite` with a sourceless
   `Texture` and the authored width and height; and
3. let the existing timeline snapshots attach, move, mask, and remove that node normally.

That slice would preserve extents and placement while continuing to say explicitly that `VideoFrame`
pixels are unsupported. It requires no document-side resource array, no decoder, and no dependency on
`@flighthq/video`. It also gives a later payload implementation the correct stable node kind: Flight has
no dedicated Video display node, because video is a changing texture source, so a video-backed 2D leaf is
a `Sprite`.

Full visual support is a separate cross-package project. It needs an enumerable encoded-stream sidecar,
a decoder or converter for SWF packet formats, a synchronous decoded-frame source for timeline
construction, and explicit resource lifetime. None of those capabilities exists today.

## What the SWF tags require

`DefineVideoStream` declares one display character. Its body contains:

- character id and declared frame count;
- pixel width and height;
- smoothing and deblocking policy; and
- a codec id. SWF defines JPEG, Sorenson H.263, Screen Video, VP6, VP6 with alpha, and Screen Video v2
  codec ids across its versions.

`VideoFrame` then supplies one packet for that character: stream id, video-frame number, and the remaining
tag bytes as codec-specific data. Those bytes are not a complete media container. Packet interpretation,
inter-frame dependencies, alpha, and random access depend on the declared codec.

The tag's position in a SWF timeline also matters. A `VideoFrame` encountered while assembling a display
frame changes what that stream character shows on that frame. Seeking directly to a Flight timeline frame
must reproduce the same displayed video frame without replaying earlier SWF tags. Therefore the importer
would have to retain both:

- the encoded packet identity: stream id plus video-frame number; and
- the owning timeline's per-frame state: which video frame each placed stream must show in each complete
  display-list snapshot.

This state is **frame content**, not a `TimelineCue`. Re-entering a frame must show the same pixels, and a
seek must construct them. That is the idempotent, seek-safe contract of `TimelineSource.constructFrame`.
A cue instead describes something edge-triggered that entering a frame does. Treating `VideoFrame` like
`StartSound` would make seeking and repeated `gotoAndStop` calls wrong.

## What the importer does today

The parser recognizes tag 60. `readSwfVideoDefinition` reads the id, frame count, width, height, flags,
and codec byte, but retains only a zero-origin rectangle in `characterBounds`. Tag 61 has no handler and
is skipped as an unknown bounded tag.

The retained rectangle does not by itself make a display character. During instantiation, an unnamed
placement earns a node only when its character is a sprite, shape, morph shape, image, or edit-text field.
A video definition is none of those, so an unnamed video placement is absent from the `nodes` map. Its
timeline frame entries and move matrices still parse, but `constructFrame` cannot find a node to attach or
transform.

The existing synthetic test, “preserves authored dimensions from a video stream definition,” covers a
different and narrower case. It gives the placement the name `videoSlot`; any named placement is forced
to allocate an empty `DisplayObject`, so that placeholder exposes the stored rectangle through the slot.
The test proves a named placeholder's bounds, not materialized video content and not ordinary unnamed
placement.

An exported but unplaced video character is likewise not instantiable through
`createScene2DSymbolFromSwf`: symbol construction recognizes edit text, images, sprites, and shapes, then
returns `null` for anything else.

The current behavior can therefore be stated precisely:

| Concern | Current result |
| --- | --- |
| bounded `DefineVideoStream` header | validated |
| declared width and height | retained internally |
| named placed stream | empty bounded `DisplayObject` |
| unnamed placed stream | no node |
| exported unplaced stream | not instantiable |
| `VideoFrame` metadata and bytes | discarded |
| pixels and playback | unsupported |

## Why the current video package cannot consume the payload

`@flighthq/video` is an acquisition and lifetime layer for browser media elements. It can wrap an
`HTMLVideoElement`, load a URL, create an object URL for a Blob, or wrap a `MediaStream`. Its byte sniffing
recognizes container signatures for MP4, WebM/Matroska, and Ogg. The resource it returns owns an element
and, for a Blob, the object URL that keeps the complete media file reachable.

That is useful after a caller has a browser-playable asset. It supplies none of the steps needed here:

- no SWF video-packet parser or codec-id mapping;
- no muxer that turns the distributed packets into a supported container;
- no decoder registry or encoded-chunk input;
- no decoded frame sequence indexed by SWF video-frame number; and
- no binding between the SWF timeline clock and the element's independent media clock.

`loadVideoResourceFromBlob` does not close those gaps. A Blob made by concatenating `VideoFrame` bodies
has no container header, track metadata, timestamps, sample table, or seeking structure. Its MIME type
cannot make it a valid media file. Even a successful codec decode would still need the timeline-frame to
video-frame mapping above.

Flight's rendering path is ready for the **result** of decode, not for the encoded input. The existing
video-texture convenience wraps an `HTMLVideoElement`, exposes an explicit per-frame version bump through
`advanceVideoTexture`, and renders that texture through a `Sprite`. Separately, the renderer-level host
image union can upload a DOM `VideoFrame`, but no resource or timeline binder presents a numbered sequence
of those frames. Those facts establish the output shape; they do not provide a decoder or make an
independently clocked media element obey a MovieClip seek.

## How the document-audio precedent applies

The principle applies: **encoded bytes belong with the imported document; playback does not.** A video
implementation must stay static and enumerable. It must not put a media channel, autoplay flag, hidden
decoder, or running clock on `Scene2DDocument`.

The current audio reference shape does not transfer literally:

| Audio precedent | SWF video consequence |
| --- | --- |
| one encoded sound payload | one stream header plus many packet tags |
| one decode fills one `AudioResource` | decode must yield an indexed sequence or seekable provider |
| a cue triggers playback | the selected video frame is idempotent display content |
| common MIME bytes can use the platform decoder | raw SWF packets are not a platform media container |
| audio clock may run after a trigger | the MovieClip frame selects video state |

A fourth generic `Scene2DDocument.videoResources` array would be justified only once its reference has a
subject-neutral resolution product. Two honest routes could reach that point:

1. the importer or a registered adapter converts a whole SWF stream into a standard media container, in
   which case an embedded video reference can carry ordinary bytes and a MIME type; or
2. Flight gains a general encoded-frame-sequence resource whose descriptor carries codec configuration,
   numbered packets, decoded-frame sinks, load state, failure, and lifetime.

Neither route exists. Adding `videoResources` now with `bytes: Uint8Array` would falsely imply the same
one-blob decode contract as audio and images. Adding SWF codec ids and `VideoFrame` records to a generic
reference would make the document header format-specific.

Payload preservation could precede that cross-format decision as an importer-specific report on
`SwfDocumentImport`, parallel to its existing placement-appearance report. A minimal opaque record would
retain the stream metadata, ordered `{ frameNumber, bytes }` packet views, and the timeline frame where
each packet occurred. That would stop byte loss for migration and analysis tools, but it would not be a
video resource and must not be presented as visual support. Once a generic resolution product is settled,
those records can feed it without changing the scene node.

## Measured cost of leaving video unsupported

The 306-file, revision-pinned Ruffle sample contains `DefineVideoStream` and `VideoFrame` in exactly one
file. A follow-up comparison examined the 29 files with multi-frame root timelines and found exactly one
display-list divergence: `from_gnash Video-EmbedSquareTest` places a video-stream character at depth 2,
then moves it on eleven consecutive frames. Because the placement is unnamed and the definition has no
materialized content kind, all eleven moves target no node.

Within this corpus that is:

- 1 of 306 files, about 0.33%, carrying the unsupported visual payload; and
- 1 of 29 multi-frame root timelines, about 3.45%, showing a structural timeline divergence.

The visual loss in that file is total for the video rectangle: no pixels draw. The structural loss is
also real, not merely theoretical—the authored node and eleven transforms are absent. Conversely, the
sample provides no evidence that a decoder-sized project outranks broader importer gaps. It is a sparse,
AVM-test-skewed corpus, so these numbers rank the observed work; they do not estimate video prevalence in
production SWFs.

## Staged implementation, if authorized

### Stage A — extents and placement only

This is the recommended smallest slice.

- Store a lightweight video-definition record keyed by character id, at least width, height, smoothing,
  and the fact that the character is video. Keeping declared frame count, deblocking, and codec id is
  cheap and avoids rereading the header if opaque preservation follows.
- Count that record as visual content during placement and exported-symbol instantiation.
- Create a `Sprite` over a sourceless 2D `Texture`, with the declared rectangle installed as its authored
  local bounds. Use the stream's smoothing flag for the sampler when that mapping is verified.
- Reuse the existing instance-key and complete-frame machinery. The same node must survive moves, seeks,
  loops, detach/reattach, names, linkage, masks, alpha, colour adjustment, and depth ordering.
- Continue to skip `VideoFrame` bodies as bounded unsupported payloads. No `VideoResource`, Blob, media
  element, playback, decoder, or document resource is created.

The observable promise is deliberately narrow: **a video character occupies and moves through the
authored graph, but draws no pixels.** Acceptance should cover unnamed placement and the eleven-frame move
shape, not only another named-slot bounds assertion.

### Stage B — opaque payload preservation

Only if migration tooling needs the encoded data before rendering exists:

- parse and retain every valid stream header and `VideoFrame` packet as zero-copy source views;
- retain video-frame number and owning timeline-frame occurrence;
- expose the records on the full SWF import report, not on generic `Scene2DDocument`; and
- report dangling packets, duplicate frame numbers, unsupported codec ids, and incomplete declared frame
  counts through structured import diagnostics without rejecting unrelated artwork.

This stage preserves evidence. It still does not resolve or render video.

### Stage C — decoded visual support

Do not start this stage until the resource product is decided. It needs:

- a registered decoder/converter capability per codec family rather than codecs statically bundled into
  `@flighthq/swf`;
- an explicit load pass that resolves the stream before timeline playback, with cancellation, failure,
  progress, and teardown;
- decoded frames addressable by video-frame number, or a seekable provider whose frame selection is
  synchronous at `constructFrame` time;
- complete per-timeline frame snapshots mapping each placed stream to its selected decoded frame; and
- texture invalidation when that selection changes.

Predecoding every frame is simple and seek-safe but can consume substantial memory. An on-demand provider
is smaller but makes readiness, cache eviction, dependent-frame decode, and asynchronous seeks part of the
public contract. Muxing to an `HTMLVideoElement` reuses current lifecycle and playback APIs but introduces
an independent clock and asynchronous seeking. Those are architectural choices, not an importer patch.

## Decision boundary

The corpus evidence warrants Stage A if structural timeline fidelity is the goal: it is a small,
well-bounded correction with an exact failing asset shape and it does not pretend to decode video. The
evidence does **not** warrant silently growing `Scene2DDocument` or `@flighthq/video`, and it does not
justify a bundled SWF codec implementation.

Authorize Stage B only for explicit payload-preservation demand. Authorize Stage C only after choosing
the generic resolution product and the predecode/provider/media-element timing model. Until then, leaving
pixels unsupported is honest; leaving unnamed placement unmaterialized is the narrow defect the present
evidence supports fixing.
