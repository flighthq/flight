---
package: '@flighthq/swf'
status: solid
score: 92
updated: 2026-08-04
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# swf — Review

## Verdict

**Solid — 92/100.** The package supplies the first honest end-to-end proof of the shared named-graph
contract: bounded `FWS` parsing turns named instances, transforms, and class linkage into enumerable
`Scene2DDocument` slot references. `DefineSprite` symbols instantiate recursively, so named descendants
survive unnamed MovieClip containers with their composed transforms. Structure is no longer frozen at one
frame: every timeline in the file crosses as `movieclip` playback data, so a document animates through the
ordinary `MovieClip` API with no SWF runtime retained. Shape definitions decode to real geometry, embedded fonts cross as
path outlines, static text places them, edit-text fields arrive as assignable text nodes, compressed
containers open through a registered decompressor, buttons contribute their up state, clip depth becomes a
real clip, morph definitions become painted retained geometry, and both bytecodes give up bounded timeline
commands without either being executed. Placement colour transforms, ordinary blend modes, advanced-blend
reports, and filter reports now preserve per-frame appearance instead of being parsed past. Both encoded
and SWF-lossless bitmap fills reach pixels, although their two loader contracts remain an unruled API fork.
The remaining SWF-local work is narrower: JPEG3/4 alpha, nested-mask intersection, scene ranges, and
interaction-state sound all wait on explicit target shapes. A
revision-pinned Ruffle pair supplies named-graph and two-frame replacement evidence, while fixed corpus
sweeps pin breadth, frequency, and the one observed video divergence.

## What is solid

- Compression is handled as the carried format it is, not as SWF's own. the shared `@flighthq/compression` registry is the
  seam; the package vendors no codec and owns no registry of its own, the registry is empty until a caller fills it, and last-write-wins
  lets a host swap in a native decoder. With the repository's existing inflate registered, the corpus sweep
  goes from 59 to 301 of 306 files imported, still with zero throws — and the shape decoder, previously
  exercised only by hand-written bytes, decodes 49,142 commands of real artwork without incident.
- Nothing throws. That contract is now backed by a mutation sweep — 3,672 mutated real files, 500 of
  which still imported, none of which threw — plus hermetic property tests in both this package and
  `abc`. A definition this decoder cannot read costs that definition and nothing else, uniformly: an
  unreadable shape body, font glyph, image of either generation, or text body leaves the rest of the
  document intact.
- The reader is bounded by both the declared file length and each tag body. Truncation, overruns,
  missing End tags, unsupported compression, and invalid headers return the package's `null` sentinel
  instead of throwing.
- `PlaceObject2`/`PlaceObject3` named instances preserve depth ordering, first-frame display-list
  state, affine transforms, and the 20-twips-per-pixel conversion.
- Legacy `PlaceObject` can carry an unnamed sprite container whose named descendants remain visible,
  while `RemoveObject` and `RemoveObject2` preserve the first-frame display-list result. `PlaceObject4`
  shares the bounded extended prefix needed for direct class linkage, names, and transforms without
  interpreting unrelated trailing metadata.
- `PlaceObject2`/`PlaceObject3` distinguish fresh placement, move/update, and replacement. Only a move
  with an existing depth inherits omitted fields; fresh records cannot retain stale names, transforms,
  or direct linkage, and stray moves cannot synthesize graph nodes.
- `DefineSprite` dictionaries instantiate recursively after the whole file is parsed, so reused
  symbols, unnamed parent containers, and multi-level world-transform composition retain the intended
  graph structure.
- Shape decoding recovers what SWF does not record. The format stores edges, each naming the fill on its
  left and right, not contours; the decoder collects edges per style, reverses the right-hand side so a
  fill's edges all run the same way around it, and stitches runs end-to-start. The nonzero winding of the
  emitted commands then matches the fill the file meant, holes included. Whole-twip coordinates make the
  stitch exact rather than tolerance-based.
- Geometry degrades one definition at a time. A shape body is decoded on its own reader, so a body this
  decoder cannot read costs that character's drawing and nothing else — the document still imports, with
  the definition as the bounded placeholder it was before geometry existed.
- Fill coverage is honest about its edge: gradients pass through with ratios, spread, and a matrix that
  needed only a translation change because Flight's gradient box is SWF's gradient square. Bitmap fills
  retain sampler intent and paint through a character-keyed texture: encoded images bind during the shared
  image-resource load, while lossless rasters unpack at import through the registered decompressor.
- Embedded images cross as undecoded bytes on an asset reference, with the media type sniffed from the
  payload's magic. Import stays synchronous and allocates no pixels; decoding belongs to the resolve step,
  which may be asynchronous and which a caller that does not need an image never runs. The reference is
  addressed by the character it came from, since an embedded asset has no address to fetch from.
- Masking reuses the clip primitive rather than inventing one. SWF masks by depth range and Flight clips a
  node and its subtree; applying one region per covered instance is equivalent to grouping them under a
  clipped container and costs no structural change. The region is resolved into each covered instance's
  local space, is per-frame so a moving mask follows, and is omitted rather than guessed when the mask
  character has no decoded geometry.
- Embedded fonts cross as what they actually are. A SWF font is a table of path outlines, so the glyph
  shapes decode through the same edge-record reader the shape tags use — minus the style array a glyph
  does not carry — and static text places them by index, scaled and recoloured per record. No text stack
  is involved, and nothing is flattened that should not be.
- `DefineEditText` becomes assignable `RichText` rather than flattened artwork. It keeps the authored
  string, box, colour, format, selection and wrapping flags; the HTML-markup branch is parsed explicitly
  because the tag declares that the stored string is markup.
- `DefineMorphShape`/`2` become painted `MorphShape` nodes. Start and end edge streams are walked together,
  the placement ratio drives geometry and paint per frame, and authored bounds interpolate with it.
- Timelines cross as data, not as a player. Each one becomes a `TimelineSource` on a `MovieClip`, so
  playback, seeking, looping, and label lookup are the `movieclip`/`timeline` engine's, and the codec
  keeps no runtime of its own — the seam `TimelineSource` was written for.
- AVM1 `DoAction`/`DoInitAction` and AVM2 `addFrameScript` handlers contribute frame scripts only when the
  whole bounded body is recognized as playback commands. The AVM2 parse composes through
  `@flighthq/abc`; the SWF package does not own a general ABC parser or execute bytecode.
- Per-frame placement appearance is preserved across Flight's two tiers. Colour transforms become node
  alpha and adjustments, ordinary blend modes live on the node, and advanced blends plus spatial filters
  leave on `SwfDocumentImport.appearances` for explicit application.
- Frames are whole display lists, so any seek is a lookup rather than a replay, and the allocation
  boundary is explicit: every node a timeline can show exists before playback starts, and
  `constructFrame` only attaches, detaches, reorders by depth, and re-transforms. An instance keeps its
  node while off-frame, so a slot bound before playback survives seeks and loops, and an unchanged
  placement matrix is the same object so a surviving instance is not re-transformed each frame.
- Frame labels arrive from both the per-frame `FrameLabel` tag and the bulk
  `DefineSceneAndFrameLabelData` record, deduplicated, ordered by frame, and dropped when they name a
  frame the timeline never reaches. The header's 8.8-fixed frame rate reaches the engine as the source
  frame rate.
- Tolerance matches the format as written rather than as specified: a tag stream ends at its bounded end
  with or without an explicit End tag, which is what Flash's own tooling emits, while truncation is still
  caught by the declared length, by a tag body reaching past its stream, and by the reader's overrun flag.
- Retaining whole frames is bounded. A per-document snapshot budget rejects a file that would multiply a
  small display list past it, closing the amplification path that whole-frame retention opens.
- The stage RECT persists as root-local authored bounds. `DefineShape*`, `DefineText*`,
  `DefineEditText`, and `DefineMorphShape*` bound prefixes persist on placed targets; first-frame sprite
  bounds recursively transform and union all available child extents.
- `DefineBitsLossless`/`DefineBitsLossless2` retain their bounded dimension prefixes before compressed
  pixels decode. `DefineVideoStream` becomes a sourceless `Sprite` at its zero-origin declared extent, so
  named, unnamed, and exported placements participate in the graph without claiming video-frame pixels.
  Invalid formats, truncated headers, zero dimensions, and duplicate character IDs reject.
- `DefineBitsJPEG2`/`DefineBitsJPEG3`/`DefineBitsJPEG4` use bounded JPEG SOF, PNG IHDR, and GIF header
  scans for local extents. JPEG3/4 respect their pre-alpha byte range, so compressed alpha data remains
  opaque; malformed headers, zero dimensions, and invalid offsets reject.
- `SymbolClass`, `ExportAssets`, and direct class names resolve linkage without parsing or executing
  ABC.
- The output crosses the intended boundary: unattached renderer-neutral nodes plus enumerable slot
  references. Registration is explicit into a caller-owned registry and has no module-load side
  effect.
- The package is portable, side-effect-free, SDK/build wired, and covered by colocated byte-level
  tests.
- The canonical [Ruffle fixture evidence](fixture-evidence.md) records the exact upstream revision,
  paths, URLs, source hashes, derived document/frame manifests, and external-asset reproduction
  procedures. The real-file pair now covers both named-graph import and a two-frame depth replacement.
  Neither external binary is committed and the test suite has no network or fixture dependency.

## Remaining depth

- Bitmap resolution has two working paths rather than one. Embedded PNG, JPEG, and GIF bytes leave on
  `Scene2DDocument.imageResources`; `loadScene2DImageResources` decodes each reference once and binds it
  into every waiting texture. SWF-lossless payloads instead inflate and unpack synchronously at import.
  Choosing a `DecodedImage` bridge or a third image-reference kind remains an API ruling, not a
  missing-pixel bug. JPEG3/4's separate alpha stream cannot be rejoined honestly until that resolved-image
  hand-back point is selected.
- Video definitions now materialize named, unnamed, and exported characters as sourceless `Sprite` nodes;
  the pinned animated sweep's only wire/tree divergence among 29 multi-frame root timelines is the exact
  shape Stage A closes. `VideoFrame` bodies stay opaque. Payload preservation and full decode remain
  separate, unauthorized projects rather than implied support.
- Nested masks collapse to the innermost rather than intersecting, because a node carries one clip. A file
  that genuinely nests two masks over one instance will clip to the inner one alone.
- Scene names are read past because Flight has frame labels but no subject for a named frame range.
- Some SWF filter fields have no honest target-effect member and remain reported at the supported fidelity
  rather than guessed. `DefineButtonSound` likewise waits for a shared button-state transition subject.
- `CWS` works through the shared deflate registration. The same seam already recognizes `ZWS`, but the
  LZMA registrant is Rust/wasm work in the separate `flight-rs` repository and cannot be built here.
- Broader AVM2 parsing belongs to the separate `abc` cell behind the existing seam. It is not an SWF
  package direction, and execution remains outside Flight.
- Real-file evidence now spans a 306-file sweep of Ruffle's test corpus as well as the canonical
  pair. Deflate registration imports 301 of 306 files; the remaining five are all `ZWS`. The sweep checks
  decoded commands and constructed trees, not reference-player pixels. The 17 nested clips are stepped but
  not wire-cross-checked, so nested-timeline evidence remains deliberately weaker than the 29 checked root
  timelines. Functional synthetic scenes now provide DOM/Canvas/WebGL/WebGPU pixels for the supported
  geometry, text, lossless bitmap, alpha, and colour-adjustment paths.

## Boundary conclusion

SWF remains a codec into Flight data, not a player: it constructs a document plus the frame data
`movieclip` plays, and retains no VM or SWF runtime of its own. The named-graph importer, animated
timelines, appearance data, visual definitions, resource references, and provenance-backed external
evidence are present. The next local change is whichever bounded decision is authorized — structural
video or bitmap-loader unification — while LZMA and broader ABC work stay outside this repository or cell.
