---
package: '@flighthq/swf'
updated: 2026-08-02
basedOn: ./review.md
---

# swf — Assessment

## Depth gaps

1. **Ship the image resolver — it is now the single blocking gap, confirmed downstream.** Two consumer
   ports failed on it: artwork built from bitmap-filled shapes imports its geometry but has no pixels to
   fill with, and embedded image definitions carry bytes no one decodes. The seam exists on both sides —
   asset references carry bytes and mime type, and bitmap fills now carry a sourceless texture the parse
   can name a character for — so what is missing is the decode and the API that hands a decoded image to
   a waiting texture. That last piece is an API shape decision rather than more SWF parsing. Superseded
   ranking, still true after it: Fields now import as `RichText` nodes with
   their authored string and format, and embedded fonts expose glyph outlines. What remains for text is
   narrow: a field with the HTML flag keeps its markup verbatim, and `parseTextMarkup` is the sanctioned
   explicit call that would turn it into content plus format ranges. Original ranking, still true: Measured against the 306-file Ruffle corpus rather
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
2. **AVM2 timeline control, then per-frame appearance.** AVM1 playback commands now import; AVM2 does not,
   and it is the larger share — `DoABC` appears in 187 corpus files against 101 for `DoAction`. Recognizing
   a frame's `stop()` there needs the ABC constant pool, method bodies, and the `addFrameScript` calls a
   compiler-generated MovieClip subclass constructor makes, which the charter's blessed 2026-07-25 ruling
   places in its own cell behind a seam rather than here. Then per-frame appearance (lower than it looks — see the measurements above). Placement transforms and clip-depth masks replay; the
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
