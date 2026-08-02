---
package: '@flighthq/swf'
status: partial
score: 76
updated: 2026-08-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# swf — Review

## Verdict

**Partial — 76/100.** The package supplies the first honest end-to-end proof of the shared named-graph
contract: bounded `FWS` parsing turns named instances, transforms, and class linkage into enumerable
`Scene2DDocument` slot references. `DefineSprite` symbols instantiate recursively, so named descendants
survive unnamed MovieClip containers with their composed transforms. Structure is no longer frozen at one
frame: every timeline in the file crosses as `movieclip` playback data, so a document animates through the
ordinary `MovieClip` API with no SWF runtime retained. Shape definitions now decode to real geometry, so a document
draws rather than merely measuring: an imported still frame is vector art in the right place at the right
size. What remains unbuilt is the rest of the visual half — bitmap, text, and font definitions carry
extents but no content, and compressed bodies are still rejected. Stage, shape, text, morph,
embedded-image, lossless-bitmap, video, and recursively composed sprite extents cover the available
named-graph sizing contract. A revision-pinned uncompressed Ruffle fixture supplies real-file evidence for
the named-slot path and exposed the zero-bit RECT compatibility case now covered synthetically.

## What is solid

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
  needed only a translation change because Flight's gradient box is SWF's gradient square; bitmap fills are
  read for alignment and left unpainted rather than approximated by a solid colour.
- Embedded images cross as undecoded bytes on an asset reference, with the media type sniffed from the
  payload's magic. Import stays synchronous and allocates no pixels; decoding belongs to the resolve step,
  which may be asynchronous and which a caller that does not need an image never runs. The reference is
  addressed by the character it came from, since an embedded asset has no address to fetch from.
- Timelines cross as data, not as a player. Each one becomes a `TimelineSource` on a `MovieClip`, so
  playback, seeking, looping, and label lookup are the `movieclip`/`timeline` engine's, and the codec
  keeps no runtime of its own — the seam `TimelineSource` was written for.
- Frames are whole display lists, so any seek is a lookup rather than a replay, and the allocation
  boundary is explicit: every node a timeline can show exists before playback starts, and
  `constructFrame` only attaches, detaches, reorders by depth, and re-transforms. An instance keeps its
  node while off-frame, so a slot bound before playback survives seeks and loops, and an unchanged
  placement matrix is the same object so a surviving instance is not re-transformed each frame.
- Frame labels arrive from both the per-frame `FrameLabel` tag and the bulk
  `DefineSceneAndFrameLabelData` record, deduplicated, ordered by frame, and dropped when they name a
  frame the timeline never reaches. The header's 8.8-fixed frame rate reaches the engine as the source
  frame rate.
- Retaining whole frames is bounded. A per-document snapshot budget rejects a file that would multiply a
  small display list past it, closing the amplification path that whole-frame retention opens.
- The stage RECT persists as root-local authored bounds. `DefineShape*`, `DefineText*`,
  `DefineEditText`, and `DefineMorphShape*` bound prefixes persist on placed targets; first-frame sprite
  bounds recursively transform and union all available child extents.
- `DefineBitsLossless`/`DefineBitsLossless2` and `DefineVideoStream` retain their bounded dimension
  prefixes as zero-origin local extents without decoding compressed pixels or video frames. Invalid
  formats, truncated headers, zero dimensions, and duplicate character IDs reject.
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
  path, URL, MIT license, source hash, derived document manifest, and ignored-asset reproduction
  procedure. The external binary is not committed and the test suite has no network or fixture
  dependency.

## Remaining depth

- Bitmap pixels reach a resolver but nothing decodes them yet. No resolver ships that turns
  `image/png`, `image/jpeg`, `image/gif`, or the lossless payloads into a textured node, so an imported
  document still draws its images as empty bounded containers until an application supplies one. A
  lossless payload additionally needs an inflate, which an asynchronous resolver can take from the
  platform rather than vendoring.
- Text and font definitions are still structural only, and morph shapes keep bounds alone; their paired
  start/end geometry has no 2D-morph home to land in.
- Playback carries placement transforms only. Per-frame color transforms, blend modes, masks (clip
  depth), filters, and `DoAction`/`DoInitAction` frame scripts are parsed past rather than imported, so
  a frame's visual state is narrower than its structural state. Frame scripts in particular have a
  natural home in `Timeline.frameScripts` and none is used yet.
- Bounds coverage follows definitions with immediate RECT or dimension prefixes. Legacy table-based
  JPEG, button, and font extents require their own tag interpretation. A symbol's extent is the union
  across its frames, so it is stable but looser than a per-frame extent would be.
- `CWS`/`ZWS` are recognized but rejected until the chartered registered decompression seam exists.
  `DoABC` remains skipped rather than exposed as an opaque blob.
- Real-file evidence currently covers one small externally produced uncompressed named-shape fixture,
  and that fixture is single-frame — every animated-timeline claim above rests on synthetic bytes, with
  no external multi-frame file crossed yet. There is still no diagnostic query, fuzz/property coverage,
  or representative external corpus for nested timelines, linkage variants, or the broader supported
  extent prefixes. Display-list opcode generations, move/update/replacement state, frame sequencing, and
  nested traversal remain covered synthetically, including unnamed intermediate symbols, removal,
  truncation, and cycle rejection.

## Boundary conclusion

SWF remains a codec into Flight data, not a player: it constructs a document plus the frame data
`movieclip` plays, and retains no VM or SWF runtime of its own. The named-graph importer, its animated
timelines, and one provenance-backed external proof are present. Visual-tag breadth, per-frame appearance
state, compression, and broader compatibility evidence should remain separately staged.
