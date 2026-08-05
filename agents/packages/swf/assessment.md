---
package: '@flighthq/swf'
updated: 2026-08-04
basedOn: ./review.md
---

# swf — Assessment

## Audit basis

This assessment was checked against `packages/swf/src`, its colocated tests, and the functional SWF scenes
at Flight commit `4074fdc8f`. Corpus statements use the fixed Ruffle sample and revision recorded in
[`fixture-evidence.md`](fixture-evidence.md); every absolute below names the Flight commit that recorded
the measurement so a later corpus or importer change cannot silently rewrite the claim.

## Closed since review

- **Text and morph content are real nodes.** `DefineEditText` creates assignable `RichText`, including the
  authored format and explicitly parsed HTML-markup branch. `DefineMorphShape`/`2` create painted
  `MorphShape` geometry whose per-placement ratio and bounds change with the timeline. Neither is a
  bounds-only placeholder now.
- **Per-frame appearance crosses the importer.** A placement colour transform becomes node alpha plus a
  colour adjustment; ordinary blend modes live on the node; advanced blends and spatial filters leave on
  `SwfDocumentImport.appearances`; colour-matrix filters join the node adjustment stack. Move records
  inherit or replace each channel on the frame that authored it. At measurement commit `8dd53f4a2`, the
  fixed corpus contained colour transforms on 41 of 784 placements and a blend mode in one file. Those
  low-prevalence items are implemented, not work that should still outrank measured gaps.
- **Both script generations supply bounded playback data.** AVM1 `DoAction` and `DoInitAction` recognize
  all-playback blocks. AVM2 frame control is recovered through the separate `@flighthq/abc` seam by
  reading `addFrameScript` and the handler it names; no bytecode is executed. Wider ABC parsing belongs to
  the `abc` cell under the charter's 2026-07-25 ruling and is not SWF-package work.
- **Bitmap payloads reach pixels.** Encoded JPEG/PNG/GIF references bind through
  `loadScene2DImageResources`; SWF-lossless rasters unpack at import through the registered deflate seam.
  The functional SWF scene renders its lossless checker on DOM, Canvas, WebGL, and WebGPU. The remaining
  question is one loader contract for both paths, not whether the pixels exist.
- **Real-file evidence covers structure and animation.** The revision-pinned canonical pair crosses the
  named-graph and a two-frame depth replacement. The broader animated sweep steps 46 clips and
  wire-cross-checks 29 root timelines; the nested 17 are stepped without a wire comparison, an explicit
  evidence limit rather than an importer claim.

## Ranked remaining decisions

1. **Rule on structural video import before implementing it.** At measurement commit `59fa8c6fc`, one of
   29 multi-frame root timelines diverged from its wire records because an unnamed `DefineVideoStream`
   placement earns no node; the fixed sample contains video in 1 of 306 files. The unruled
   [video proposal](../../swf-video-import-proposal.md) recommends a bounded first stage: a sourceless
   `Sprite` preserves extents, identity, moves, masks, and seeks while continuing to state that
   `VideoFrame` pixels are unsupported. It does not authorize a decoder or a generic video resource.
2. **Rule on the shared bitmap-loading contract.** Encoded images currently resolve through the browser
   `Image` path while SWF-lossless data becomes a `Bitmap` eagerly. The two honest designs remain a bridge
   from the MIME-keyed `@flighthq/image-codec` `DecodedImage` result into the loader, or an additive third
   `ImageResourceReference` kind with both 2D and 3D loader dispatch. Straight versus premultiplied alpha
   is part of the first route. No route is selected here, and the working eager lossless path must remain
   unchanged until the ruling.
3. **Rank only the remaining local fidelity gaps after those decisions.** `DefineBitsJPEG3`/`4` drops its
   separate alpha stream (one file in the fixed 301-readable-file sample at `8dd53f4a2`); nested masks keep
   only the innermost clip; scene names have no timeline-scene home; and some SWF filter fields exceed the
   target effect vocabulary. `DefineButtonSound` still needs an interaction-state subject rather than a
   frame cue. The committed samples do not establish an ordering among those items beyond the one-file
   JPEG-alpha observation.

## External and out-of-cell work

- **`ZWS` is not local implementation work.** At measurement commit `f0c56ba7d`, registering the settled
  deflate decoder moves the fixed corpus from 59 to 301 imports out of 306; the remaining 5 are all the
  LZMA `ZWS` form. `swf` already maps that container to the shared `Compression.Lzma` registry key. The
  natural implementation is a Rust/wasm registrant built in the separate `flight-rs` repository. It
  cannot be built in this repository and must not be re-scoped as a hand-written TypeScript decoder.
- **AVM2 is not a new SWF-package direction.** The bounded frame-command recognition already composes
  through `@flighthq/abc`. Any broader ABC format work belongs to its own cell behind that seam, and a VM
  remains outside Flight entirely.
- **Backend capability is not parser loss.** WebGL and WebGPU opt into colour-adjustment accumulation and
  render the imported transform. Canvas and DOM have no such registrar, so their honest result is a null
  render-proxy adjustment and untinted pixels. The importer preserves the authored adjustment in both
  cases; adding a Canvas registrar or unconditional accumulation would be a renderer decision, not an SWF
  repair.

## Recommended

Do not start either unruled fork. If structural video Stage A is authorized, it is the next bounded local
slice because it has an exact real-file divergence and does not pretend to decode pixels. Report the
bitmap-routing alternatives for a ruling in parallel. No LZMA or broader AVM2 implementation belongs in
this repository.

## Backlog after the rulings

- Rejoin `DefineBitsJPEG3`/`4` colour and alpha once the resolved-image hand-back point is chosen.
- Represent intersecting nested masks if the clip vocabulary gains a multi-region subject.
- Represent scene ranges from `DefineSceneAndFrameLabelData` if the timeline vocabulary gains scenes.
- Preserve filter fields only after their target effect types can state them without approximation.
- Add structured parse diagnostics and a reference-player pixel comparison; extend the wire cross-check
  from root timelines to instantiated nested sprites.
- Carry `DefineButtonSound` only after button interaction states have a shared subject.
