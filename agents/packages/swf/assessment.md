---
package: '@flighthq/swf'
updated: 2026-08-04
basedOn: ./review.md
---

# swf — Assessment

## Closed since review

- **Embedded image resolution is complete.** `DefineBitsJPEG2`/`3`/`4` payloads whose magic identifies
  JPEG, PNG, or GIF leave the synchronous importer as embedded image references, with every sampler
  variant's waiting texture attached. `loadScene2DImageResources` decodes each reference once and binds the
  resulting `Image` into all of those textures. The cross-package proof builds bitmap-filled SWF artwork
  around a complete 1x1 PNG, checks the emitted bytes and texture identity, runs the shared loader, and
  observes the browser-backed image on that exact fill texture.

## Depth gaps

1. **AVM2 timeline control, then per-frame appearance.** AVM1 playback commands now import; AVM2 does not,
   and it is the larger share — `DoABC` appears in 187 corpus files against 101 for `DoAction`. Recognizing
   a frame's `stop()` there needs the ABC constant pool, method bodies, and the `addFrameScript` calls a
   compiler-generated MovieClip subclass constructor makes, which the charter's blessed 2026-07-25 ruling
   places in its own cell behind a seam rather than here. Then per-frame appearance (lower than it looks — see the measurements above). Placement transforms and clip-depth masks replay; the
   color transform, blend mode, and filter list on the same records are parsed past, and
   `DoAction`/`DoInitAction` frame scripts have a home in `Timeline.frameScripts` that nothing fills
   yet. A frame's visual state is narrower than its structural state until these cross.
2. **Add LZMA, and expand compatibility evidence.** Deflate is settled: `@flighthq/compression` owns the
   inflate and the shared registry, and one `registerDeflateDecompressor()` takes the corpus from 59 to
   301 of 306 files. Only `ZWS` remains, at 5 of 306 files, and it is the natural first candidate for a
   Rust/wasm registrant rather than a hand-written TypeScript decoder. Also expose `DoABC` payloads opaquely, and expand the revision-pinned real-file evidence
   beyond the canonical single-frame named-shape fixture — no external animated file has crossed the
   importer, so multi-frame behavior rests on synthetic bytes alone.

## Recommended

_None. The canonical uncompressed real-file evidence is revision-pinned and reproducible without
committing the external asset or making tests network-dependent._

## Backlog

- A single deferred route for both encoded images and SWF-lossless rasters. The current seams support two
  materially different designs: teach the embedded resolver to consult the MIME-keyed
  `@flighthq/image-codec` registry and bridge its raw `DecodedImage` into a texture source, or add the
  explicitly anticipated third member to the v1-closed `ImageResourceReference` union and teach resource
  loaders how it resolves. The first crosses an existing `Image`-returning browser path and must settle
  straight versus premultiplied alpha; the second widens shared types and both 2D/3D loader dispatch. This
  assessment records the fork without selecting one, and keeps the working eager lossless path unchanged.
- Visual definition breadth beyond the canonical named-shape fixture's structural bounds.
- Scene names from `DefineSceneAndFrameLabelData`, read past today because a scene is a named frame
  range rather than a frame label and has no Flight home yet.
- Registered `CWS`/`ZWS` decompression seams.
- Opaque `DoABC` payload exposure and any separate ABC parser. ABC execution remains out of scope.
- Structured parse diagnostics and broad version/tag compatibility reporting.
