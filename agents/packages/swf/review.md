---
package: '@flighthq/swf'
status: solid
score: 86
updated: 2026-08-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# swf — Review

## Verdict

**Solid — 86/100.** The package supplies the first honest end-to-end proof of the shared named-graph
contract: bounded `FWS` parsing turns named instances, transforms, and class linkage into enumerable
`Scene2DDocument` slot references. `DefineSprite` symbols instantiate recursively, so named descendants
survive unnamed MovieClip containers with their composed transforms. Structure is no longer frozen at one
frame: every timeline in the file crosses as `movieclip` playback data, so a document animates through the
ordinary `MovieClip` API with no SWF runtime retained. Shape definitions decode to real geometry, embedded fonts cross as
path outlines, static text places them, edit-text fields arrive as assignable text nodes, compressed
containers open through a registered decompressor, buttons contribute their up state, clip depth becomes a
real clip, and both bytecodes give up their timeline commands without either being executed. What remains
unbuilt is narrower than what is built: morph geometry, per-frame colour beyond alpha, blend modes and
filters, and the resolver that turns embedded image bytes into pixels. Stage, shape, text, morph,
embedded-image, lossless-bitmap, video, and recursively composed sprite extents cover the available
named-graph sizing contract. A revision-pinned uncompressed Ruffle fixture supplies real-file evidence for
the named-slot path and exposed the zero-bit RECT compatibility case now covered synthetically.

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
  needed only a translation change because Flight's gradient box is SWF's gradient square; bitmap fills are
  read for alignment and left unpainted rather than approximated by a solid colour.
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
- Tolerance matches the format as written rather than as specified: a tag stream ends at its bounded end
  with or without an explicit End tag, which is what Flash's own tooling emits, while truncation is still
  caught by the declared length, by a tag body reaching past its stream, and by the reader's overrun flag.
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
- `DefineEditText` is still structural only, and deliberately so: it carries a string plus a font
  reference rather than glyph indices, so it needs the font's code table, its advance table, and line
  breaking — and flattening it to paths would destroy the editability that defines it. The outlines are
  imported; a path-backed glyph source to consume them is the unbuilt piece. The measured corpus puts
  `DefineEditText` in 49 files against 6 for static text, so this is the larger half of text by usage.
- Morph shapes keep bounds alone; their paired start/end geometry has no 2D-morph home to land in.
- Playback carries placement transforms and clip-depth masks. Per-frame color transforms, blend modes,
  filters, and `DoAction`/`DoInitAction` frame scripts are still parsed past rather than imported, so a
  frame's visual state remains narrower than its structural state. Frame scripts in particular have a
  natural home in `Timeline.frameScripts` and none is used yet.
- Nested masks collapse to the innermost rather than intersecting, because a node carries one clip. A file
  that genuinely nests two masks over one instance will clip to the inner one alone.
- Bounds coverage follows definitions with immediate RECT or dimension prefixes. Legacy table-based
  JPEG, button, and font extents require their own tag interpretation. A symbol's extent is the union
  across its frames, so it is stable but looser than a per-frame extent would be.
- `CWS`/`ZWS` are recognized but rejected until the chartered registered decompression seam exists.
  `DoABC` remains skipped rather than exposed as an opaque blob.
- Real-file evidence now spans a 306-file sweep of Ruffle's test corpus as well as the canonical
  fixture: nothing throws, every uncompressed file imports, and all 247 rejections are compressed
  containers. That retires the "no external file has crossed this importer" caveat for parsing. It does
  not retire it for rendering — nothing in the sweep is rasterized, so geometry is checked as commands,
  never as pixels, and no external file has been compared against a reference player. There is still no diagnostic query, fuzz/property coverage,
  or representative external corpus for nested timelines, linkage variants, or the broader supported
  extent prefixes. Display-list opcode generations, move/update/replacement state, frame sequencing, and
  nested traversal remain covered synthetically, including unnamed intermediate symbols, removal,
  truncation, and cycle rejection.

## Boundary conclusion

SWF remains a codec into Flight data, not a player: it constructs a document plus the frame data
`movieclip` plays, and retains no VM or SWF runtime of its own. The named-graph importer, its animated
timelines, and one provenance-backed external proof are present. Visual-tag breadth, per-frame appearance
state, compression, and broader compatibility evidence should remain separately staged.
