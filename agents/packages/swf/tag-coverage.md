---
package: '@flighthq/swf'
updated: 2026-08-04
---

# swf — tag coverage

What every core SWF tag becomes in a `Scene2DDocument`, and for the ones that become nothing, why. The
frequency column counts files in the 306-file Ruffle corpus described in
[`fixture-evidence.md`](fixture-evidence.md); a dash means the tag does not appear there, not that it is
rare in the wild.

## Carried into the document

| Tag | Becomes | Files |
| --- | --- | --- |
| `End`, `ShowFrame` | Frame boundaries — every frame's display list | 301 |
| `PlaceObject` … `PlaceObject4` | Placements: depth, character, name, transform, linkage, clip depth, colour transform, blend mode, filters | 80 |
| `RemoveObject`, `RemoveObject2` | Display-list removal before the frame closes | — |
| `DefineSprite` | A nested `MovieClip` with its own playhead | 75 |
| `DefineShape` … `DefineShape4` | `Shape` geometry: fills, gradients, strokes | 49 |
| `DefineFont`, `DefineFont2`, `DefineFont3` | Index-keyed `GlyphOutlineSource` paths, advances, metrics, and embedded code tables | 38 / 18 |
| `DefineFontInfo`, `2` | Legacy `DefineFont` codepoint table, composed over its outline source | 14 |
| `DefineText`, `DefineText2` | Placed glyph outlines, scaled and coloured per record | 6 |
| `DefineButton`, `DefineButton2` | The up state, as a one-frame timeline | 6 |
| `DefineBits` + `JPEGTables` | A spliced JPEG payload on an asset reference | 1 |
| `DefineBitsJPEG2` … `JPEG4` | An encoded payload on an asset reference, with extents | 1 |
| `DefineBitsLossless`, `2` | Decoded pixels plus declared extents when deflate is registered | 5 |
| `DefineVideoStream` | A `Sprite` over a sourceless `Texture`, with declared extents (payload opaque) | 1 |
| `SetBackgroundColor` | `Scene2DDocument.backgroundColor` | 250 |
| `FrameLabel`, `DefineSceneAndFrameLabelData` | `TimelineSource.labels` | 125 |
| `SymbolClass`, `ExportAssets` | Slot linkage identity, and the library `createScene2DSymbolFromSwf` instantiates from | 186 / 44 |
| `DefineMorphShape`, `2` | Geometry and paint, driven by the placement ratio | 4 |
| `DefineEditText` | A `RichText` node: the authored string (markup parsed), box, colour, and format | 49 |
| `DoAction` (AVM1) | A frame script, when the block is *only* playback commands | 101 |
| `DoInitAction` | A frame-1 script on the sprite it names, under the same recognition rule as `DoAction` | 11 |
| `DoABC` (AVM2) | A frame script, by reading `addFrameScript` and the handler it names | 187 |
| `DefineScalingGrid` | A `Scale9Shape` when the sprite it names is a wrapper around one shape; see below | — |
| `DefineSound` | An `AudioResourceReference` on the document, tagged with the format's media type | 2 |
| `StartSound`, `StartSound2` | A `TimelineAudioCue` on the frame that carries it | 2 / — |
| `SoundStreamHead`, `2`, `SoundStreamBlock` | One concatenated payload plus a `TimelineStreamAudioCue` on the frame the stream starts | 2 |

## Deliberately carried no further

These are read past. Each is a decision, not an oversight.

| Tag | Why | Files |
| --- | --- | --- |
| Everything else in a `DoABC` payload | Read, never run. Only `addFrameScript` and the playback calls its handlers make are recognized; all other bytecode is inert data. | — |
| `DoAction` blocks that are not purely playback | Declined whole. Honouring the legible half of a script misrepresents what the frame does. | — |
| `FileAttributes`, `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`, `EnableDebugger2`, `EnableTelemetry` | Authoring and player metadata with no scene content. | 250 / 155 / 122 / 122 / 27 / 60 / 13 |
| `DefineFontAlignZones`, `DefineFontName`, `CSMTextSettings` | Font hinting and naming metadata not used by the outline source. | 15 / 7 |
| `DefineBinaryData` | Arbitrary embedded bytes with no display meaning. | 2 |
| `VideoFrame` | Codec packets, not browser-playable files. Stage A carries the stream character and its graph placement but deliberately creates no decoder or pixel source. | 1 |
| `ImportAssets`, `2` | Names characters in *another* file, which a single-document import cannot resolve. | 1 |
| `Protect`, `SetTabIndex`, `DefineButtonCxform` | Authoring and player metadata with no scene content. | — |
| `DefineButtonSound` | **Unimplemented, and blocked on a design decision rather than on effort.** It attaches sounds to a button's *state transitions* — roll out, roll over, press, release. A button imports as a one-frame timeline of its up state, so there is no interaction state machine for those transitions to hang on, and a frame cue would be the wrong shape: these fire on pointer state, not on entering a frame. Carrying them needs an interaction-state concept this package cannot invent alone. | — |

## What a sound becomes

Audio is not scene-graph content, and none of it is on the graph. A sound's **bytes** become an
`AudioResourceReference` in `Scene2DDocument.audioResources`, on exactly the image lane's terms; a sound's
**trigger** becomes a cue on the `TimelineSource` that carried it. Nothing plays: a cue is authored data
that only a registered handler acts on.

Three things worth knowing before touching this:

- **Every format is tagged, including the ones nothing can decode yet.** MP3 becomes `audio/mpeg`. The
  formats with no registered media type take a vendor one carrying the parameters their bitstreams omit —
  `audio/vnd.adobe.swf-adpcm; rate=22050; channels=1; bits=16` — because ADPCM, Nellymoser and raw PCM
  cannot be decoded without a rate and channel count, and a null type is indistinguishable from bytes
  nobody identified. A decoder registers against the type's essence, so one registration serves every
  parameter combination. An MP3 payload's leading seek offset is not part of the bitstream and is skipped.
- **One sound is one `AudioResource`, shared by every cue that names it.** A sound cued from forty frames
  is forty cues holding the same resource, so it decodes once and all forty are live together. Concurrent
  sounds are separate cues on one frame, never several resources on one reference.
- **A trigger can precede the sound it names**, by character id or by class. In/out points are counted in
  the sound's own samples and envelope points in 44.1kHz samples whatever the sound's rate, so the
  conversion to seconds runs as a post-pass once every sound and every `SymbolClass` binding is known.

Stream sounds are a separate cue kind from event sounds, because the two need opposite seek behaviour and
`dispatchOnSeek` is registered per kind: scrubbing past an event sound must not fire it, while scrubbing a
stream must resync it.

## When a scaling grid becomes a nine-slice shape

`DefineScalingGrid` hangs the grid on a *sprite*, but Flight's nine-slice lives on the shape whose commands
get remapped. The two meet only where the sprite is a wrapper: one frame placing one unnamed, unmasked
shape at identity, which is what an authoring tool emits when a designer sets `scale9Grid` on artwork. That
sprite collapses into a single `Scale9Shape`. A grid on a multi-frame or multi-layer sprite is dropped
rather than misapplied, because it describes a composition no single command stream can carry.

## A second corpus, not in this repo

The `Files` column above counts the 306-file Ruffle corpus, which is synthetic and thin on audio, buttons,
and production-scale artwork. The audio and scaling-grid work was driven instead by a 427-file corpus of
real authored content, which is **not committed and not redistributable** — it is fetched into a gitignored
directory. Treat the following as observations that shaped the design rather than as a fixture anyone can
re-run:

| Observed | Count |
| --- | --- |
| `DefineSound` characters | 959, of which 956 MP3, 2 ADPCM, 1 Nellymoser |
| Sounds no `StartSound` ever triggers | 264 — and all 264 are `ExportAssets`-named, which is why a reference carries `name` |
| `StartSound` triggers | 2051, of which 132 are stops, 231 carry envelopes, 181 carry in/out points |
| Envelope points setting the channels apart | 211 of 583, which is why an envelope point is stereo |
| `SoundStreamHead2` tags declaring no samples | 53,740 of 53,755 — an authoring tool writes an empty one into nearly every sprite |
| `DefineScalingGrid` target sprites that are single-shape wrappers | 634 of 634 |
| `DefineButtonSound`, `StartSound2` | 0 — neither appears, so neither is corpus-verified |

## Edit text markup

A field with the HTML flag stores markup where its characters would be, and much of the corpus does
exactly that (`<p align="left"><font face=…`). Because the file itself declares the string is markup, the
importer parses it through `@flighthq/text-markup`'s `parseTextMarkup`, giving the node its plain text and
format ranges. That is an explicit call on a string already known to be markup — not a property that
parses on assignment, which is [an anti-goal](../../anti-goals.md). After the corpus sweep, no imported
field is left holding raw markup.

## What an image payload actually contains

An asset reference's `mimeType` describes the bytes beside it, and the four shapes are not equally
decodable by a generic image decoder. This matters to whoever writes the resolver.

| Shape | `mimeType` | What a resolver receives |
| --- | --- | --- |
| `DefineBits` + `JPEGTables` | `image/jpeg` | A complete stream, spliced: neither half is valid alone. |
| `DefineBitsJPEG2` … `4` carrying JPEG | `image/jpeg` | A complete stream. The legacy end-of-image / start-of-image pair that sits between the tables and the pixels is removed, because a strict decoder may stop at it. |
| `DefineBitsJPEG2` … `4` carrying PNG or GIF | `image/png`, `image/gif` | The embedded file, unmodified. |
| `DefineBitsLossless`, `2` | `image/x-swf-lossless[-alpha]` | **Not a standard image format** — a zlib-compressed raw raster, closer to a BMP than a PNG. This package unpacks it itself: decompression comes from the shared registry, and the pixel layout (8-bit colour-mapped, 15-bit, or 24/32-bit) is format knowledge that lives here. A shape's bitmap fill receives its pixels at import as soon as a deflate decompressor is registered — no decoder and no asynchrony. `Lossless2` pixels stay premultiplied, and the bitmap says so. |

**`DefineBitsJPEG3`/`4` alpha is not carried.** Those tags append a *separate* zlib-compressed alpha
channel after the colour image. The reference hands over the colour stream only, so a resolver that decodes
it faithfully still produces an opaque image, and nothing in the media type says so. This is the remaining
edge, and it is the one case that genuinely needs the two halves rejoined: the colour is a format only an
outside decoder reads, while the alpha is zlib this package can already inflate. So the shape of the
missing piece is known — hand the decoded colour pixels back in, and combine them here with the alpha.

## Degradation is uniform

Every definition this decoder cannot read costs that definition and nothing else — an unreadable shape
body, font glyph, image of either generation, or text body leaves the rest of the document intact. The
modern `DefineBitsJPEG` path used to be the one exception, rejecting the whole document; it was brought in
line, because failing an entire import over one unreadable picture costs far more than the picture.
