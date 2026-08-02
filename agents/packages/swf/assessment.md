---
package: '@flighthq/swf'
updated: 2026-08-02
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Decode bitmap pixels, then text and fonts.** `DefineShape` through `DefineShape4` now draw, so the
   still frame is vector-complete; bitmaps and text are what is left of the visible content. Bitmaps need
   a ruling first, not code: `DefineBitsLossless` is a synchronous `createBitmap`/`createTexture` path
   behind a deflate Flight already has once in `scene3d-formats`, so the question is whether that inflate
   is extracted into a cell both consume or mirrored per-cell behind a registered seam. `DefineBitsJPEG*`
   needs both a decoder Flight has only asynchronously and a home for embedded encoded payloads in a
   document model that addresses assets by URI.
2. **Carry per-frame appearance and frame scripts.** Placement transforms replay; the color transform,
   blend mode, clip-depth mask, and filter list on the same records are parsed past, and
   `DoAction`/`DoInitAction` frame scripts have a home in `Timeline.frameScripts` that nothing fills
   yet. A frame's visual state is narrower than its structural state until these cross.
3. **Complete container seams and compatibility coverage.** Route `CWS`/`ZWS` through registered
   decompressors, expose `DoABC` payloads opaquely, and expand the revision-pinned real-file evidence
   beyond the canonical single-frame named-shape fixture — no external animated file has crossed the
   importer, so multi-frame behavior rests on synthetic bytes alone.

## Recommended

_None. The canonical uncompressed real-file evidence is revision-pinned and reproducible without
committing the external asset or making tests network-dependent._

## Backlog

- Visual definition breadth beyond the canonical named-shape fixture's structural bounds.
- Scene names from `DefineSceneAndFrameLabelData`, read past today because a scene is a named frame
  range rather than a frame label and has no Flight home yet.
- Registered `CWS`/`ZWS` decompression seams.
- Opaque `DoABC` payload exposure and any separate ABC parser. ABC execution remains out of scope.
- Structured parse diagnostics and broad version/tag compatibility reporting.
