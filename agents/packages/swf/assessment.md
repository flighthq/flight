---
package: '@flighthq/swf'
updated: 2026-08-02
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Ship the image resolver, then text and fonts.** `DefineShape` through `DefineShape4` draw, and
   embedded image bytes now reach the resolve step with their media type, so what is missing is the
   resolver that turns those bytes into a textured node: platform or `@flighthq/image-codec` decode for
   JPEG/PNG/GIF, and an inflate plus `createBitmap`/`createTexture` for the SWF lossless formats, which an
   asynchronous resolver can take from `DecompressionStream` rather than vendoring. Whether that resolver
   ships from `swf`, from `scene2d-resources`, or from an application is the open question. Text and font
   definitions remain structural after that.
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
