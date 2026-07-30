---
package: '@flighthq/swf'
status: partial
score: 62
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# swf — Review

## Verdict

**Partial — 62/100.** The package now supplies the first honest end-to-end proof of the shared
named-graph contract: bounded `FWS` parsing turns root-timeline named instances, transforms, and class
linkage into enumerable `Scene2DDocument` slot references. `DefineSprite` first frames now instantiate
recursively, so named descendants survive unnamed MovieClip containers with their composed transforms.
The slice is deliberately structural. It does not yet recover later timeline frames, visual definitions,
or compressed bodies, so it is a sound importer nucleus rather than broad SWF support. Stage, shape,
text, morph, embedded-image, lossless-bitmap, video, and recursively composed sprite extents now cover
the available named-graph sizing contract. A revision-pinned uncompressed Ruffle fixture supplies
real-file evidence for the named-slot path and exposed the zero-bit RECT compatibility case now covered
synthetically.

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

- Only the first display-list frame is materialized. Later `ShowFrame` deltas, frame labels, playback,
  and conversion into `movieclip`/`timeline` data remain unimplemented.
- No `DefineShape*`, bitmap, text, font, or sprite visual definition is materialized. The current
  targets are structural containers, not rendered archive content.
- Bounds coverage follows definitions with immediate RECT or dimension prefixes. Legacy table-based
  JPEG, button, and font extents require their own tag interpretation, while later-frame sprite extent
  changes remain unavailable with the first-frame-only graph.
- `CWS`/`ZWS` are recognized but rejected until the chartered registered decompression seam exists.
  `DoABC` remains skipped rather than exposed as an opaque blob.
- Real-file evidence currently covers one small externally produced uncompressed named-shape fixture.
  There is still no diagnostic query, fuzz/property coverage, or representative external corpus for
  nested timelines, linkage variants, or the broader supported extent prefixes. Display-list opcode
  generations, move/update/replacement state, first-frame isolation, and nested traversal remain
  covered synthetically, including unnamed intermediate symbols, removal, truncation, and cycle
  rejection.

## Boundary conclusion

SWF remains a codec into Flight data, not a player: it constructs a static document and retains no VM
or SWF runtime. The first real named-graph importer and one provenance-backed external proof are now
present. Later-frame timeline data, visual-tag breadth, compression, and broader compatibility evidence
should remain separately staged.
