---
package: '@flighthq/swf'
updated: 2026-07-30
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Recover animated MovieClip timelines.** Recursive first-frame `DefineSprite` graphs now retain
   names, depths, linkage, and composed transforms across `PlaceObject` through `PlaceObject4` and both
   removal forms. Preserve later frame deltas, labels, and playback structure as `movieclip`/`timeline`
   data without retaining a SWF player runtime.
2. **Materialize visible archive content.** Add versioned `DefineShape*`, bitmap, text/font, mask,
   color-transform, blend, and filter coverage onto existing Flight primitives without retaining a
   player runtime.
3. **Complete container seams and evidence.** Route `CWS`/`ZWS` through registered decompressors,
   expose `DoABC` payloads opaquely, and validate supported tags against representative externally
   produced fixtures.

## Recommended

Sweep-safe continuations of the approved named-graph direction, without expanding into a player or VM:

1. **Add one canonical uncompressed fixture.** Check in a tiny externally generated `FWS` sample with
   its provenance and assert the same document manifest produced by the synthetic builders.

## Backlog

- Visual definition breadth beyond what the next named-graph fixture requires.
- Registered `CWS`/`ZWS` decompression seams.
- Opaque `DoABC` payload exposure and any separate ABC parser. ABC execution remains out of scope.
- Structured parse diagnostics and broad version/tag compatibility reporting.
