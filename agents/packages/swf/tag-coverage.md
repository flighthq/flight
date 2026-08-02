---
package: '@flighthq/swf'
updated: 2026-08-02
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
| `PlaceObject` … `PlaceObject4` | Placements: depth, character, name, transform, linkage, clip depth, colour-transform alpha | 80 |
| `RemoveObject`, `RemoveObject2` | Display-list removal before the frame closes | — |
| `DefineSprite` | A nested `MovieClip` with its own playhead | 75 |
| `DefineShape` … `DefineShape4` | `Shape` geometry: fills, gradients, strokes | 49 |
| `DefineFont`, `DefineFont2`, `DefineFont3` | Index-keyed `GlyphOutlineSource` paths, advances, metrics, and embedded code tables | 38 / 18 |
| `DefineFontInfo`, `2` | Legacy `DefineFont` codepoint table, composed over its outline source | 14 |
| `DefineText`, `DefineText2` | Placed glyph outlines, scaled and coloured per record | 6 |
| `DefineButton`, `DefineButton2` | The up state, as a one-frame timeline | 6 |
| `DefineBits` + `JPEGTables` | A spliced JPEG payload on an asset reference | 1 |
| `DefineBitsJPEG2` … `JPEG4` | An encoded payload on an asset reference, with extents | 1 |
| `DefineBitsLossless`, `2` | An encoded payload plus declared extents | 5 |
| `DefineVideoStream` | Declared frame extents (payload opaque) | 1 |
| `SetBackgroundColor` | `Scene2DDocument.backgroundColor` | 250 |
| `FrameLabel`, `DefineSceneAndFrameLabelData` | `TimelineSource.labels` | 125 |
| `SymbolClass`, `ExportAssets` | Slot linkage identity, and the library `createScene2DSymbolFromSwf` instantiates from | 186 / 44 |
| `DefineMorphShape`, `2` | Authored extents only — no 2D-morph home yet | 4 |
| `DefineEditText` | A `RichText` node: the authored string (markup parsed), box, colour, and format | 49 |
| `DoAction` (AVM1) | A frame script, when the block is *only* playback commands | 101 |
| `DoABC` (AVM2) | A frame script, by reading `addFrameScript` and the handler it names | 187 |

## Deliberately carried no further

These are read past. Each is a decision, not an oversight.

| Tag | Why | Files |
| --- | --- | --- |
| `DoInitAction` | A frame-1 script on the sprite it names, under the same recognition rule as `DoAction` | 11 |
| Everything else in a `DoABC` payload | Read, never run. Only `addFrameScript` and the playback calls its handlers make are recognized; all other bytecode is inert data. | — |
| `DoAction` blocks that are not purely playback | Declined whole. Honouring the legible half of a script misrepresents what the frame does. | — |
| `FileAttributes`, `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`, `EnableDebugger2`, `EnableTelemetry` | Authoring and player metadata with no scene content. | 250 / 155 / 122 / 122 / 27 / 60 / 13 |
| `DefineFontAlignZones`, `DefineFontName`, `CSMTextSettings` | Font hinting and naming metadata not used by the outline source. | 15 / 7 |
| `DefineSound`, `SoundStreamHead`, `2`, `SoundStreamBlock`, `StartSound` | Audio is not scene-graph content. A `Scene2DDocument` holds a 2D graph; routing sound into `@flighthq/audio` is a separate contract. | 2 / 2 |
| `DefineBinaryData` | Arbitrary embedded bytes with no display meaning. | 2 |
| `VideoFrame` | Video payload frames; the stream's extents are already carried. | 1 |
| `ImportAssets`, `2` | Names characters in *another* file, which a single-document import cannot resolve. | 1 |
| `Protect`, `SetTabIndex`, `DefineScalingGrid`, `DefineButtonSound`, `DefineButtonCxform` | Absent from the corpus. `DefineScalingGrid` has an obvious Flight home in `scale9Shape` and is the most likely of these to earn support. | — |

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
