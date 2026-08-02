---
package: '@flighthq/swf'
updated: 2026-08-02
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Materialize text, then ship the image resolver.** Measured against the 306-file Ruffle corpus rather
   than assumed: `DefineEditText` appears in 49 files — as many as every `DefineShape` generation
   combined — with `DefineFont2` in 38 and `DefineFont3` in 18, so text is the largest remaining hole in a
   still frame. By the same measurement, per-frame colour transform covers only 41 of 784 placements and
   blend mode just 1 file, which puts both well below text. `DefineShape` through `DefineShape4` draw, and
   embedded image bytes now reach the resolve step with their media type, so what is missing is the
   resolver that turns those bytes into a textured node: platform or `@flighthq/image-codec` decode for
   JPEG/PNG/GIF, and an inflate plus `createBitmap`/`createTexture` for the SWF lossless formats, which an
   asynchronous resolver can take from `DecompressionStream` rather than vendoring. Whether that resolver
   ships from `swf`, from `scene2d-resources`, or from an application is the open question. Text and font
   definitions remain structural after that.
2. **Carry per-frame appearance and frame scripts** (lower than it looks — see the measurements above). Placement transforms and clip-depth masks replay; the
   color transform, blend mode, and filter list on the same records are parsed past, and
   `DoAction`/`DoInitAction` frame scripts have a home in `Timeline.frameScripts` that nothing fills
   yet. A frame's visual state is narrower than its structural state until these cross.
3. **Add LZMA, and expand compatibility evidence.** Deflate is settled: `@flighthq/compression` owns the
   inflate and the shared registry, and one `registerDeflateDecompressor()` takes the corpus from 59 to
   301 of 306 files. Only `ZWS` remains, at 5 of 306 files, and it is the natural first candidate for a
   Rust/wasm registrant rather than a hand-written TypeScript decoder. Also expose `DoABC` payloads opaquely, and expand the revision-pinned real-file evidence
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
