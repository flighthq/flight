---
package: '@flighthq/swf'
status: solid
score: 95
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - diagnostics.md
  - tag-coverage.md
  - capabilities.md
---

# swf -- Review

## Verdict

**Solid -- 95/100.** The package is the most heavily instrumented codec in the SDK: 82 declared
capabilities, 48 structured diagnostic drop sites across six source files, and 27 of those
capabilities carrying fire-and-silence proofs. Since the previous review (93, 2026-08-07), two
of its three highest-impact gaps have closed. Structured import diagnostics now exist through
`@flighthq/importdiagnostics` -- 37 `reportImportDiagnostic` calls in `swfDocument.ts` alone,
with four severity levels (`Reject`, `Drop`, `Skip`, `Recover`) -- replacing the prior state
where a caller learned about losses only through an opt-in guard's log line. The
`importdiagnostics` dependency is declared in `package.json` and imported in every module that
reports, resolving the prior charter contradiction. Two new entry points --
`createScene2DSymbolFromSwf` for instantiating a library symbol by linkage name and
`readSwfExportedSymbolNames` for enumerating them -- widen the API from whole-document import to
selective symbol extraction. JPEG3/4 alpha data is now retained on `SwfDocumentImport` as
`jpegAlphaPayloads`, and `createSwfJpegAlphaBitmap` (contract export) composes decoded JPEG pixels
with a decompressed alpha plane. `DefineScalingGrid` produces `Scale9Shape` nodes. Audio resources
-- `DefineSound`, `StartSound`/`StartSound2`, `SoundStreamHead`/`SoundStreamBlock` -- land as
sound cues and stream data on timelines. The remaining gaps are genuine format or design
boundaries, not missing infrastructure.

## Present capabilities

Everything in this section is verified against `packages/swf/src` and colocated tests. Source
references are file:line to this tree.

- **Container and error contract.** `createScene2DFromSwf` reads `FWS` directly and `CWS`/`ZWS`
  through the shared `@flighthq/compression` registry; the package vendors no codec and owns no
  registry of its own. The reader (`swfReader.ts`, 103 lines) is bounded by both the declared file
  length and each tag body. `valid = false` on overrun prevents unbounded reads. Truncation,
  overruns, unsupported compression, and invalid headers return the `null` sentinel rather than
  throwing. A tag stream ends at its bounded end with or without an explicit `End` tag.
- **Structured import diagnostics.** Every public entry point accepts an optional
  `diagnostics?: ImportDiagnostic[]` sink. 48 `reportImportDiagnostic` call sites span
  `swfDocument.ts` (37), `swfFilter.ts` (3), `swfFrameAction.ts` (2), `swfText.ts` (2),
  `swfMorphShape.ts` (2), and `swfShape.ts` (2). The four severity levels carry distinct semantics:
  `Reject` for a refused input, `Drop` for lost data, `Skip` for a recognised-but-unsupported
  feature, `Recover` for degraded continuation. Each diagnostic carries a stable `kind` string
  (`swf.*`-prefixed) and an `origin` naming the emitting function. 27 of 82 declared capabilities
  have instrumented loss paths with both fire and silence proofs
  (`diagnostics.md`, `instrumentation.json`).
- **Entry points.** Ten public exports: `createScene2DFromSwf` (document only),
  `createScene2DImportFromSwf` (document + appearances + JPEG alpha payloads),
  `createScene2DSymbolFromSwf` (single symbol by linkage name),
  `readSwfExportedSymbolNames` (linkage enumeration),
  `createGlyphOutlineSourcesFromSwf` (font outlines from a SWF),
  `registerSwfScene2DDocumentImporter` (registry registration),
  plus the guard triple (`enableSwfGuards`, `disableSwfGuards`, `areSwfGuardsEnabled`) and
  `registerSwfImageDecoders`. Contract lane adds `createSwfJpegAlphaBitmap`, `readSwfFilterList`,
  and `setSwfFilterListGuard`.
- **Placement generations and per-frame state.** `PlaceObject` through `PlaceObject4` and both
  removal generations are covered. `PlaceObject2`/`3` distinguish fresh placement, move/update, and
  replacement. Per-frame appearance data -- matrix, node alpha, fixed-function blend mode, the
  colour-adjustment stack, morph ratio, clip, and `DefineScalingGrid` -- is applied by
  `constructFrame` (`swfDocument.ts`). Advanced blends and spatial filters travel beside the
  document on `SwfDocumentImport.appearances`, one entry per (instance, frame), so a filter list
  a later frame drops stops being reported. Colour-matrix filters join the node adjustment stack.
- **Geometry.** `DefineShape` through `DefineShape4` decode to drawable commands via edge-based
  fill recovery: edges collected per style, fill0 reversed, runs stitched end-to-start into closed
  contours whose nonzero winding reproduces the authored fill, holes included. Whole-twip
  coordinates make the stitch exact. Line styles carry caps, joints, and miter limits. Solid,
  gradient (linear/radial/focal), and bitmap fills are supported. A body that does not parse costs
  that character's drawing alone and is reported via `swf.shape-body-unreadable`.
- **Morphs.** `DefineMorphShape`/`2` become painted `MorphShape` nodes with both edge sets walked
  in step by `readSwfMorphShapePaths` (shared with `swfShape.ts`). Morph gradients, solid fills,
  bitmap fills, and paired line styles with start/end widths and colours are all read. The ratio
  lives on the placement, so it is per-frame data and authored bounds interpolate with it.
- **Scale9.** `DefineScalingGrid` maps a character to a `Scale9Shape` node via
  `createSwfScale9ShapeNode` (`swfDocument.ts`).
- **Text and fonts.** `DefineFont`/`2`/`3` decode into the index-keyed `GlyphOutlineSource` seam,
  publicly reachable through `createGlyphOutlineSourcesFromSwf`. `DefineFontInfo`/`DefineFontInfo2`
  supply code-point tables when the font body carries none. `resolveSwfFontUnitsPerEm` handles
  version-3's 20x-finer EM grid. `DefineText`/`2` place glyphs by index at the pen position.
  `DefineEditText` becomes assignable `RichText`, with HTML-declaring branch routed through
  `parseTextMarkup`. Font metrics (ascent, descent, leading) and kerning pairs are read when
  present.
- **Timelines as data.** Every timeline becomes a `TimelineSource` on a `MovieClip`; playback,
  seeking, looping, and label lookup belong to the `movieclip`/`timeline` engine. Frames are
  retained as whole display lists; every node a timeline can show is allocated at import so
  `constructFrame` allocates nothing. Frame labels come from both `FrameLabel` tags and
  `DefineSceneAndFrameLabelData`.
- **Bytecode as bounded data.** AVM1 `DoAction`/`DoInitAction` contribute playback-only frame
  scripts; AVM2 `addFrameScript` handlers are recognized through `@flighthq/abc`, walking
  constructor bodies for `addFrameScript` calls with goto depth bounded at 8. Nothing is executed.
  A block carrying any non-playback action is declined whole, and that declining is reported
  via diagnostic (`swf.frame-script-declined`).
- **JPEG alpha composition.** `createScene2DImportFromSwf` retains `SwfJpegAlphaPayload` entries
  for every `DefineBitsJPEG3`/`4` character, carrying the compressed alpha bytes, dimensions, and
  the deblocking parameter. `createSwfJpegAlphaBitmap` (contract export, `swfBitmap.ts`) composes
  decoded JPEG pixels with a decompressed alpha plane, applying premultiplication.
- **Audio.** `DefineSound` creates audio resources keyed by character ID. `StartSound`/
  `StartSound2` place sound cues on timeline frames. `SoundStreamHead`/`SoundStreamBlock` are
  associated with timelines. Non-MP3 stream formats are reported via
  `swf.stream-sound-format` diagnostic.
- **Resources.** Lossless rasters unpack at import through the registered decompressor, and only
  for characters something samples. Every other embedded image leaves as an
  `EmbeddedImageResourceReference` keyed by character, with the media type sniffed from the payload
  magic, so a bitmap placed a hundred times decodes once. `DefineVideoStream` characters
  materialize as `Sprite` nodes over sourceless `Texture`s at their declared extent.
- **Diagnostics seam.** `enableSwfGuards`/`disableSwfGuards`/`areSwfGuardsEnabled` use the
  inversion rule: the core exposes `setSwfFilterListGuard` as a contract-only seam, the
  caller-facing message lives in the separately importable guard module, emitted through
  `@flighthq/log`.
- **Tests.** 6,847 lines across 12 test files, with `swfDocument.test.ts` alone at 4,672. Dedicated
  `describe` blocks exercise `createScene2DSymbolFromSwf`, `readSwfExportedSymbolNames`,
  `createScene2DFromSwf import diagnostics`, `createSwfJpegAlphaBitmap`, and per-module concerns
  (reader, shape, morph, filter, text, edit text, bitmap, frame actions, image decoder, image
  resources, guards).

## Gaps

- **One measured animation loss remains, and it is the corpus's only wire/tree divergence.** On a
  video placement the per-frame ratio selects the decoded video frame -- a different quantity from
  the morph ratio that occupies the same field. Flight applies a placement ratio to `MorphShapeKind`
  alone, so a video `Sprite` has nowhere to put it and `VideoFrame` payloads are not retained.
- **Two bitmap loading paths, not one.** Encoded payloads resolve through a browser `Image` in
  `loadImageResourceFromBytes`, which never consults the MIME-keyed `@flighthq/image-codec`
  registry, while SWF-lossless rasters unpack eagerly at import. The encoded path is therefore
  browser-only; headless and native hosts get no pixels from it.
- **JPEG3/4 alpha is retained but not composed during import.** The data travels on
  `SwfDocumentImport.jpegAlphaPayloads` and `createSwfJpegAlphaBitmap` exists for post-import
  composition, but the import path itself emits a `Drop` diagnostic
  (`swf.jpeg-alpha-stream`) and leaves the colour stream opaque. Composition is a
  caller responsibility pending a hand-back ruling.
- **Nested masks collapse to the innermost** rather than intersecting, because a node carries one
  clip. The outer of two masks covering one instance is reported via
  `swf.nested-mask-collapsed`.
- **Scene ranges are read past.** `DefineSceneAndFrameLabelData`'s labels are imported; its scene
  names are reported via `swf.scene-names` and not carried, because Flight has no subject for a
  named frame range.
- **Some filter fields exceed the target effect vocabulary.** Gradient glow angle, distance, and
  inner/on-top placement are reported and skipped. `BlurEffect` pass count is reported. Convolution
  alpha is dropped. Knockout and composite-source filter flags are unread -- now an importer gap
  rather than a target-capability gap, since `EffectSourceMode` carries `'knockout'`
  (`types/src/EffectSourceMode.ts`) and the relevant effects all accept `sourceMode`.
- **`DefineButtonSound` is unrepresented**, and a frame cue is the wrong shape: the sound fires on
  a pointer-state transition, while a button imports as a one-frame timeline of its up state.
- **`ZWS` cannot be completed here.** No LZMA decompressor is registered in this repo; the shared
  registry key exists and its natural registrant is out-of-repository work.
- **Version 2 morph gradients are untested.** No corpus file carries one; whether the stop-count
  byte packs spread/interpolation in the high nibble like a static gradient is unknown.
- **No reference-player pixel comparison.** All corpus evidence measures the constructed tree and
  decoded commands, never pixels against a player.

## Charter contradictions

One divergence, small and in the charter's description of the entry-point shape rather than in its
principles. The Boundaries and Decisions are honoured without exception: the codec retains no
player, every output lands on an existing Flight subject, ABC and compression are carried rather
than owned, and canonical binary evidence stays external and reproducible.

- **The chartered entry-point signature is stale.** The charter states
  `createScene2DFromSwf(source: Uint8Array) -> Scene2DDocument | null` with no second parameter.
  The implementation is `createScene2DFromSwf(source: Uint8Array, diagnostics?: ImportDiagnostic[])`.
  The diagnostics parameter exists, honoring the charter's own naming of `importdiagnostics` as a
  dependency, but the charter's entry-point line does not mention it. Additionally, the charter does
  not list the three newer entry points (`createScene2DImportFromSwf`,
  `createScene2DSymbolFromSwf`, `readSwfExportedSymbolNames`) that widen the API surface. This is
  a stale charter line, not a code defect.

Previously reported contradiction **resolved**: the prior review noted that
`@flighthq/importdiagnostics` was chartered as a dependency but absent from `package.json` and all
imports. It is now declared in `package.json` (line 52) and imported in `swfDocument.ts`,
`swfFilter.ts`, `swfShape.ts`, `swfFrameAction.ts`, `swfText.ts`, and `swfMorphShape.ts`, and used
extensively in tests via `collectImportDiagnostics`.

## Contract & docs fit

Living up to the contract: types are `@flighthq/types`-first (zero exported `interface`, `type`,
or `enum` in `packages/swf/src/`; `SwfDocumentImport`, `SwfJpegAlphaPayload`, `SwfNodeAppearance`,
and `SwfFilterListGuard` all reside in `packages/types/src/`), exported names carry the full
unabbreviated type they operate on, expected failures return sentinels rather than throwing, the
manifest declares `sideEffects: false` and exactly the two blessed export lanes (`.` and
`./contract`), registration is an explicit `registerSwfScene2DDocumentImporter` call with no
module-load side effect, and the guard seam is contract-only while the guard module is public.

The charter now has a `## North star` section (lines 38-46), resolving the prior review's note
that it was absent.

Candidate revisions to the contract and admin docs themselves:

- **The charter entry-point line** should be updated to reflect the `diagnostics?` parameter and
  the three newer entry points.
- **The cell carries supplementary docs** -- `fixture-evidence.md`, `tag-coverage.md`,
  `diagnostics.md`, `capabilities.md`, `instrumentation.json` -- which are load-bearing (the
  fixture record keeps corpus claims reproducible without committing a binary, and the
  instrumentation mapping enforces proof drift).

## Candidate open directions

Questions the charter does not answer that this survey encountered:

1. **Where does a placement ratio live when the placed character is not a morph?** SWF overloads
   one field across two quantities -- morph progress and video frame selection. The charter's scope
   line lists `PlaceObject*` state without naming ratio at all.
2. **When does JPEG3/4 alpha composition become automatic?** The infrastructure exists
   (`SwfJpegAlphaPayload` on the import, `createSwfJpegAlphaBitmap` for composition), but the seam
   between them is currently the caller's responsibility. An import option or a post-resolve hook
   would close it.
3. **How far does "codec, not a player" reach into evidence?** All current real-file evidence
   measures the constructed tree. Whether a reference-player pixel comparison is in scope for a
   codec cell, or belongs to the functional-scene layer, is unstated.
4. **Do supplementary evidence docs belong in a cell**, and if so should the cell contract name
   them rather than warn on them?
5. **Should the diagnostic instrumentation target expand beyond 27/82?** The current 27 are the
   capabilities whose loss paths have all been wired, fire-proven, and silence-proven. The remaining
   55 produce silence that is uninformative rather than trustworthy. The audit infrastructure is
   mature enough to support a wider sweep.
