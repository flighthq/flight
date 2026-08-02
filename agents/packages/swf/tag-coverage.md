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
| `PlaceObject` … `PlaceObject4` | Placements: depth, character, name, transform, linkage, clip depth | 80 |
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
| `SymbolClass`, `ExportAssets` | Slot linkage identity | 186 / 44 |
| `DefineMorphShape`, `2` | Authored extents only — no 2D-morph home yet | 4 |
| `DefineEditText` | Authored extents only — see below | 49 |
| `DoAction` (AVM1) | A frame script, when the block is *only* playback commands | 101 |

## Deliberately carried no further

These are read past. Each is a decision, not an oversight.

| Tag | Why | Files |
| --- | --- | --- |
| `DoABC`, `DoInitAction` | Bytecode. The charter exposes it at most as an opaque blob and never executes it; running it is [an anti-goal](../../anti-goals.md). AVM2 puts `stop()` behind a constant pool, method bodies, and the `addFrameScript` calls a generated class constructor makes — a decode surface that belongs in its own cell, per the charter's 2026-07-25 ruling. `@flighthq/abc` now reads the container; what remains is instruction decoding and the Flash-side recognition, which stays in `swf`. | 187 / 11 |
| `DoAction` blocks that are not purely playback | Declined whole. Honouring the legible half of a script misrepresents what the frame does. | — |
| `FileAttributes`, `Metadata`, `ProductInfo`, `ScriptLimits`, `DebugID`, `EnableDebugger2`, `EnableTelemetry` | Authoring and player metadata with no scene content. | 250 / 155 / 122 / 122 / 27 / 60 / 13 |
| `DefineFontAlignZones`, `DefineFontName`, `CSMTextSettings` | Font hinting and naming metadata not used by the outline source. | 15 / 7 |
| `DefineSound`, `SoundStreamHead`, `2`, `SoundStreamBlock`, `StartSound` | Audio is not scene-graph content. A `Scene2DDocument` holds a 2D graph; routing sound into `@flighthq/audio` is a separate contract. | 2 / 2 |
| `DefineBinaryData` | Arbitrary embedded bytes with no display meaning. | 2 |
| `VideoFrame` | Video payload frames; the stream's extents are already carried. | 1 |
| `ImportAssets`, `2` | Names characters in *another* file, which a single-document import cannot resolve. | 1 |
| `Protect`, `SetTabIndex`, `DefineScalingGrid`, `DefineButtonSound`, `DefineButtonCxform` | Absent from the corpus. `DefineScalingGrid` has an obvious Flight home in `scale9Shape` and is the most likely of these to earn support. | — |

## Known asymmetry

A malformed `DefineBitsJPEG2`/`3`/`4` rejects the whole document, while a malformed shape body, font
glyph, or legacy `DefineBits` pair degrades to a placeholder and leaves the rest of the import alone. The
degrading behaviour is the one that matches real files — a nested legacy image pair caused exactly that
failure during the corpus sweep — so the modern JPEG path is the outlier and should be brought in line
when something exercises it.
