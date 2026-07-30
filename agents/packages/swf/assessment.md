---
package: '@flighthq/swf'
updated: 2026-07-30
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Recover complete named MovieClip graphs.** Parse `DefineSprite` timelines, instantiate their
   first-frame display lists recursively, and compose parent/child transforms while retaining names,
   depths, and linkage.
2. **Materialize visible archive content.** Add versioned `DefineShape*`, bitmap, text/font, mask,
   color-transform, blend, and filter coverage onto existing Flight primitives without retaining a
   player runtime.
3. **Complete container seams and evidence.** Route `CWS`/`ZWS` through registered decompressors,
   expose `DoABC` payloads opaquely, and validate supported tags against representative externally
   produced fixtures.

## Recommended

Sweep-safe continuations of the approved named-graph direction, without expanding into a player or VM:

1. **Import nested `DefineSprite` named slots.** Add bounded sprite-tag traversal and a fixture that
   proves recursive slot names, linkage, and composed transforms.
2. **Preserve authored extents.** Carry the stage RECT and available character bounds into the
   document root and slot target bounds.
3. **Add one canonical uncompressed fixture.** Check in a tiny externally generated `FWS` sample with
   its provenance and assert the same document manifest produced by the synthetic builders.

## Backlog

- Visual definition breadth beyond what the next named-graph fixture requires.
- Registered `CWS`/`ZWS` decompression seams.
- Opaque `DoABC` payload exposure and any separate ABC parser. ABC execution remains out of scope.
- Structured parse diagnostics and broad version/tag compatibility reporting.
