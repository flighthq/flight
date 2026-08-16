---
package: '@flighthq/swf'
updated: 2026-08-08
by: principal
---

# swf — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against source on 2026-08-08. A file:line is a claim about this tree.

**Standing rules on work in this cell.**

- **Nothing from a SWF is executed.** AVM1 `DoAction` and AVM2 `DoABC` are *recognized* as data and
  emitted as `Timeline` frame scripts bound to Flight's own MovieClip calls. Broader ABC parsing is the
  `abc` cell's work behind that seam; execution stays outside Flight.
- **License provenance.** No SWF, ABC, or corpus binary is committed in this repo (verified: zero
  `*.swf`/`*.abc`). [`fixture-evidence.md`](fixture-evidence.md) records how to obtain and hash a file
  and must never record whose terms it carries.
- **Before extracting the conformance scoreboard into a shared core**, read
  [conformance core generality](conformance-core-generality.md). That core is held, not rejected.

**Unfinished / known-wrong.**

- **An imported document does not play itself, and playing one clip plays only that clip.**
  `setMovieClipSource` ends in `gotoAndStopTimeline` (`movieclip/src/movieClip.ts:144`) and
  `updateMovieClip` advances the one timeline it is handed (`:152`), never its descendants. Both are
  deliberate — implicit playback and an implicit tree walk are the hidden runtime behaviour this SDK
  refuses — but this is the likeliest reason an imported animation "doesn't work".
- **SWF's knockout and composite-source filter flags are unread.** `swfFilter.ts` defines constants only
  for `FILTER_INNER` (0x80), `FILTER_PASSES`, and `FILTER_BEVEL_ON_TOP`; the knockout/composite bits are
  never sampled. This is now an *importer* gap, not a target-capability gap: `EffectSourceMode` carries
  `'knockout'` (`types/src/EffectSourceMode.ts:5`) and `OuterGlowEffect`, `DropShadowEffect`, and
  `BevelEffect` all take `sourceMode`.
- **Three filter fields are genuinely unrepresentable and are declined loudly.** `GradientGlowEffect` has
  no angle, distance, or inner/on-top member, so an authored one is skipped (`swfFilter.ts:162`);
  `BlurEffect` has no pass count, so an authored count is read and reported (`:79`); `ConvolutionEffect`
  takes packed RGB only, so the authored filter alpha is dropped (`:215`).
- **`DefineBitsJPEG3`/`4` alpha is dropped.** The colour stream ends at the alpha offset and the
  zlib-compressed block after it is discarded, so a transparent JPEG imports opaque
  (`swfDocument.ts:2460`, `Drop` diagnostic `swf.jpeg-alpha-stream`). Rejoining is SWF-specific and needs
  an entry-point ruling — an import option, or a post-pass over a resolved document.
- **The bitmap-loader fork is unruled.** `loadImageResourceFromBytes`
  (`image/src/imageResourceFrom.ts:104`) goes bytes → `Blob` → `HTMLImageElement` and never consults
  `getImageDecoder`, so headless and native hosts get no encoded pixels; `@flighthq/image-codec` instead
  returns raw straight-RGBA `DecodedImage`. `ImageResourceReference` is a closed union over Embedded and
  External (`types/src/ImageResourceReference.ts:25`) anticipating an additive third member. Eager
  lossless resolution stays until a route is picked; JPEG3/4 alpha waits on the same hand-back point.
- **`ZWS` cannot be completed here.** `swfDocument.ts:555` maps `ZWS` to `Compression.Lzma`, but no LZMA
  decompressor is registered anywhere in this repo. Its natural home is a Rust/wasm registrant in
  `flight-rs`, not a hand-written TypeScript decoder.
- **Where a video placement's ratio lives is unruled.** `swfDocument.ts:898` applies a placement ratio to
  `MorphShapeKind` alone, and `VideoFrame` packets are not retained (`:332`). On a video placement the
  ratio names which decoded frame to show — a different quantity in the same field. This is the corpus
  sweep's one surviving wire/tree divergence; measurement in [`fixture-evidence.md`](fixture-evidence.md).
- **Version 2 morph gradients are untested.** `swfMorphShape.ts:256` reads the whole stop-count byte as
  the count, which every version 1 morph agrees with; no corpus file carries a v2 morph gradient, so
  whether that form packs spread/interpolation into the high nibble the way a static gradient does is
  unknown. The alternate reading was tried, fixed nothing, and reverted rather than shipped unverified.
- **`DefineButtonSound` is blocked on a design decision.** It attaches sound to pointer-state
  transitions, while a button imports as a one-frame timeline of its up state; a frame cue is the wrong
  shape. `swfDocument.ts:2965` records that it names no declared capability.
- **Nested masks do not intersect.** The innermost mask covering a depth wins (`swfDocument.ts:950`),
  because Flight carries one clip per node. Scene ranges are likewise staged rather than misrepresented.
- **`conformance/swf/swf-import-conformance-worker-pool` is load-sensitive, unowned, and not known to be
  a defect.** Under the whole-repo sweep it fails as `Test timed out in 15000ms`; run alone with
  `--project conformance` it passes in ~23s. Before reading a red sweep as a regression here, apply the
  discriminator in [commands](../../commands.md).

Per-tag disposition — carried, or read past and why — is in [`tag-coverage.md`](tag-coverage.md).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the claim that glow/shadow/bevel
  descriptors "have no mapping for SWF's composite-source and knockout flags": `EffectSourceMode` now
  carries `'knockout'` and all three take `sourceMode`, so that is an unread importer flag, not a target
  gap. Angle, distance, and quality are likewise carried now for drop shadow, glow, and bevel.
- **2026-08-04** — Morphs, editable text, audio, per-frame appearance, and resolved bitmap fills landed.
- **2026-08-02** — `DefineShape`–`DefineShape4` decode to real drawable geometry on `Shape` nodes.
- **2026-08-01** — Animated timelines: whole-display-list frames, labels, header frame rate.
- **2026-07-30** — Built as the first named-graph source for `Scene2DDocument`.
