---
package: '@flighthq/swf'
updated: 2026-07-30
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Recover animated MovieClip timelines.** Recursive first-frame `DefineSprite` graphs now retain
   names, depths, linkage, and composed transforms across `PlaceObject` through `PlaceObject4` and both
   removal forms; fresh, move/update, and replacement records produce an isolated first-frame
   snapshot. Preserve later frame deltas, labels, and playback structure as `movieclip`/`timeline` data
   without retaining a SWF player runtime.
2. **Materialize visible archive content.** Add versioned `DefineShape*`, bitmap, text/font, mask,
   color-transform, blend, and filter coverage onto existing Flight primitives without retaining a
   player runtime. Embedded JPEG/PNG/GIF, lossless bitmap, and video dimension prefixes now supply
   structural extents, not decoded pixels or frames.
3. **Complete container seams and compatibility coverage.** Route `CWS`/`ZWS` through registered
   decompressors, expose `DoABC` payloads opaquely, and expand the revision-pinned real-file evidence
   beyond the canonical named-shape fixture to nested timelines, linkage variants, and supported
   extent prefixes.

## Recommended

_None. The canonical uncompressed real-file evidence is revision-pinned and reproducible without
committing the external asset or making tests network-dependent._

## Backlog

- Visual definition breadth beyond the canonical named-shape fixture's structural bounds.
- Registered `CWS`/`ZWS` decompression seams.
- Opaque `DoABC` payload exposure and any separate ABC parser. ABC execution remains out of scope.
- Structured parse diagnostics and broad version/tag compatibility reporting.
