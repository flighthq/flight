---
package: '@flighthq/swf'
status: partial
score: 36
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# swf — Review

## Verdict

**Partial — 36/100.** The package now supplies the first honest end-to-end proof of the shared
named-graph contract: bounded `FWS` parsing turns root-timeline named instances, transforms, and class
linkage into enumerable `Scene2DDocument` slot references. `DefineSprite` first frames now instantiate
recursively, so named descendants survive unnamed MovieClip containers with their composed transforms.
The slice is deliberately structural. It does not yet recover later timeline frames, visual definitions,
authored extents, compressed bodies, or real-file evidence, so it is a sound importer nucleus rather
than broad SWF support.

## What is solid

- The reader is bounded by both the declared file length and each tag body. Truncation, overruns,
  missing End tags, unsupported compression, and invalid headers return the package's `null` sentinel
  instead of throwing.
- `PlaceObject2`/`PlaceObject3` named instances preserve depth ordering, first-frame display-list
  state, affine transforms, and the 20-twips-per-pixel conversion.
- `DefineSprite` dictionaries instantiate recursively after the whole file is parsed, so reused
  symbols, unnamed parent containers, and multi-level world-transform composition retain the intended
  graph structure.
- `SymbolClass`, `ExportAssets`, and direct class names resolve linkage without parsing or executing
  ABC.
- The output crosses the intended boundary: unattached renderer-neutral nodes plus enumerable slot
  references. Registration is explicit into a caller-owned registry and has no module-load side
  effect.
- The package is portable, side-effect-free, SDK/build wired, and covered by colocated byte-level
  tests.

## Remaining depth

- Only the first display-list frame is materialized. Later `ShowFrame` deltas, frame labels, playback,
  and conversion into `movieclip`/`timeline` data remain unimplemented.
- No `DefineShape*`, bitmap, text, font, or sprite visual definition is materialized. The current
  targets are structural containers, not rendered archive content.
- Stage and character bounds are read only far enough to advance the stream; authored extents are not
  preserved on the root or slot targets.
- `CWS`/`ZWS` are recognized but rejected until the chartered registered decompression seam exists.
  `DoABC` remains skipped rather than exposed as an opaque blob.
- Evidence is synthetic. There is no small externally produced fixture, tag version matrix,
  diagnostic query, or fuzz/property coverage. Nested traversal is covered synthetically, including an
  unnamed intermediate symbol and cycle rejection.

## Boundary conclusion

SWF remains a codec into Flight data, not a player: it constructs a static document and retains no VM
or SWF runtime. The next confidence-bearing steps are authored extents and a real fixture; later-frame
timeline data, visual-tag breadth, and compression should remain separately staged.
