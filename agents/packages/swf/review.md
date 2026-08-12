---
package: '@flighthq/swf'
status: solid
score: 93
updated: 2026-08-07
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - fixture-evidence.md
---

# swf — Review

## Verdict

**Solid — 93/100.** The package supplies the first honest end-to-end proof of the shared named-graph
contract: bounded `FWS` parsing turns named instances, transforms, and class linkage into enumerable
`Scene2DDocument` slot references. `DefineSprite` symbols instantiate recursively, so named descendants
survive unnamed MovieClip containers with their composed transforms. Structure is not frozen at one frame:
every timeline in the file crosses as `movieclip` playback data, so a document animates through the
ordinary `MovieClip` API with no SWF runtime retained. Shape definitions decode to real geometry, embedded
fonts cross as path outlines, static text places them, edit-text fields arrive as assignable text nodes,
compressed containers open through a registered decompressor, buttons contribute their up state, clip
depth becomes a real clip, morph definitions become painted retained geometry, and both bytecodes give up
bounded timeline commands without either being executed. Placement colour transforms, ordinary blend
modes, advanced-blend reports, and filter reports preserve per-frame appearance instead of being parsed
past. Both encoded and SWF-lossless bitmap fills reach pixels, although their two loader contracts remain
an unruled API fork. The score moves up one point on evidence rather than features: the corpus wire
cross-check now covers instantiated nested sprites as well as root timelines, retiring the weakest
standing limit in the package's real-file evidence.

## Present capabilities

Everything in this section is grounded in `packages/swf/src` and its colocated tests at
`6aff889db`, and the corpus figures in [fixture-evidence.md](fixture-evidence.md).

- **Container and error contract.** `createScene2DFromSwf` reads `FWS` directly and
  `CWS`/`ZWS` through the shared `@flighthq/compression` registry; the package vendors no codec and owns no
  registry of its own. The reader (`swfReader.ts`) is bounded by both the declared file length and each tag
  body. Truncation, overruns, unsupported compression, and invalid headers return the `null` sentinel
  rather than throwing — backed by a 3,672-mutant sweep in which 500 mutants still imported and none threw.
  A tag stream ends at its bounded end with or without an explicit `End` tag, which is what Flash's own
  tooling emits.
- **Placement generations and per-frame state.** `PlaceObject` through `PlaceObject4` and both removal
  generations are covered. `PlaceObject2`/`3` distinguish fresh placement, move/update, and replacement:
  only a move at an occupied depth inherits omitted fields, stray moves synthesize nothing, and a
  replacement at one depth is a different instance with its own node.
- **Per-frame appearance.** `constructFrame` (`swfDocument.ts:704-776`) applies matrix, node alpha,
  fixed-function blend mode, the colour-adjustment stack, morph ratio, and clip per frame, each written
  only when that frame's value differs by reference from what is already on the node. Advanced blends and
  spatial filters do not touch a node: they leave on `SwfDocumentImport.appearances`, one entry per
  (instance, frame), so a filter list a later frame drops stops being reported. Colour-matrix filters join
  the node adjustment stack, since a pointwise remap folds into the draw.
- **Geometry.** `DefineShape` through `DefineShape4` decode to drawable commands. The decoder recovers what
  SWF does not record: the format stores edges naming the fill on each side, so edges are collected per
  style, the right-hand side is reversed, and runs are stitched end-to-start into closed contours whose
  nonzero winding matches the authored fill, holes included. Whole-twip coordinates make the stitch exact
  rather than tolerance-based. A body that does not parse costs that character's drawing alone.
- **Morphs.** `DefineMorphShape`/`2` become painted `MorphShape` nodes, both edge sets walked in step by
  `readSwfMorphShapePaths` so a style index's two paths come out with identical structure. The ratio lives
  on the placement, so it is per-frame data and authored bounds interpolate with it.
- **Text and fonts.** `DefineFont`/`2`/`3` decode into the index-keyed `GlyphOutlineSource` seam, publicly
  reachable through `createGlyphOutlineSourcesFromSwf`. `DefineText`/`2` place glyphs by index at the pen
  position rather than laying out characters. `DefineEditText` becomes assignable `RichText`, with the
  HTML-declaring branch explicitly routed through `parseTextMarkup`.
- **Timelines as data.** Every timeline becomes a `TimelineSource` on a `MovieClip`; playback, seeking,
  looping, and label lookup belong to the `movieclip`/`timeline` engine. Frames are retained as whole
  display lists, so any seek is a lookup. Every node a timeline can show is allocated at import, so
  `constructFrame` allocates nothing and a slot bound before playback survives seeks and loops.
- **Bytecode as bounded data.** AVM1 `DoAction`/`DoInitAction` and AVM2 `addFrameScript` handlers
  contribute frame scripts only when the whole bounded body is recognized as playback commands; a block
  carrying anything else is declined whole. The AVM2 parse composes through `@flighthq/abc`. Nothing is
  executed.
- **Resources.** Lossless rasters unpack at import through the registered decompressor, and only for
  characters something samples. Every other embedded image leaves as an `ImageResourceReference` keyed by
  character, with the media type sniffed from the payload magic, so a bitmap placed a hundred times decodes
  once. `DefineVideoStream` characters materialize as `Sprite` nodes over sourceless `Texture`s at their
  declared extent.
- **Diagnostics.** `enableSwfGuards`/`disableSwfGuards`/`areSwfGuardsEnabled` follow the inversion rule:
  the core exposes `setSwfFilterListGuard` as a contract-only seam and the caller-facing message lives in
  the separately importable guard module, emitted through `@flighthq/log`.
- **Real-file evidence.** Two revision-pinned Ruffle fixtures cross named-graph import and a two-frame
  depth replacement. A 306-file corpus sweep imports 301 with zero throws and decodes 49,142 shape
  commands. The animated sweep steps 46 multi-frame clips over 411 frames; the wire cross-check now covers
  **29 root timelines and all 17 instantiated nested sprites**, with the nested arm falsified before being
  believed — freezing the tree side turns every agreement into a divergence. No binary is committed and the
  hermetic suite needs neither the network nor the corpus.

## Gaps

- **One measured animation loss remains, and it is the corpus's only wire/tree divergence.** On a video
  placement the per-frame records carry only a ratio, which selects the decoded video frame — measured
  directly: on each of the ten move frames of `from_gnash/misc-ming.all/Video-EmbedSquareTest` the
  placement ratio equals the `VideoFrame` packet number on that frame. Flight applies a placement ratio to
  `MorphShapeKind` alone, so a video `Sprite` has nowhere to put it and `VideoFrame` payloads are skipped.
  Structural Stage A fixed the graph shape and did **not** close this.
- **Two bitmap loading paths, not one.** Encoded payloads resolve through a browser `Image` in
  `loadImageResourceFromBytes`, which never consults the MIME-keyed `@flighthq/image-codec` registry, while
  SWF-lossless rasters unpack eagerly at import. The encoded path is therefore browser-only: headless and
  native hosts get no pixels from it. `DefineBitsJPEG3`/`4`'s separate alpha stream is dropped, and cannot
  be rejoined until the resolved-image hand-back point exists.
- **Nested masks collapse to the innermost** rather than intersecting, because a node carries one clip.
- **Scene ranges are read past.** `DefineSceneAndFrameLabelData`'s labels are imported; its scene names are
  not, because Flight has frame labels but no subject for a named frame range.
- **Some filter fields exceed the target effect vocabulary** — angle, distance, inner/on-top placement,
  pass count, composite-source and knockout flags, and an authored convolution alpha have no member to land
  in and are reported at supported fidelity rather than guessed.
- **`DefineButtonSound` is unrepresented**, and a frame cue is the wrong shape for it: the sound fires on a
  pointer-state transition, while a button imports as a one-frame timeline of its up state.
- **`ZWS` cannot be completed here.** The five corpus rejections are all LZMA; the shared registry key
  already exists and its natural registrant is out-of-repository work.
- **No structured parse diagnostics.** A caller learns that a document was lossy only through the opt-in
  filter guard's log line; there is no queryable record of what a given import declined.
- **No reference-player pixel comparison.** All corpus evidence measures the constructed tree and decoded
  commands, never pixels against a player.

## Charter contradictions

Two divergences, both small and both in the charter's own description of the package's shape rather than
in its principles. The Boundaries and Decisions are honoured without exception — the codec retains no
player, every output lands on an existing Flight subject, ABC and compression are carried rather than
owned, and canonical binary evidence stays external and reproducible.

- **The chartered entry point takes an options argument the code does not have.** The charter states
  `createScene2DFromSwf(bytes, options) → Scene2DDocument`; the implementation is
  `createScene2DFromSwf(source: Uint8Array)`, with no second parameter anywhere in the public surface. No
  import option has been needed so far. Either the charter line is stale or an option surface is intended
  and unbuilt; the source does not say which.
- **`@flighthq/importdiagnostics` is chartered as a direct dependency and is not one.** The charter names
  it in the shared lower layer this package depends on directly. It appears in neither
  `packages/swf/package.json` nor any import in `src/`. What exists instead is the `@flighthq/log` guard
  seam. This is the same fact as the "no structured parse diagnostics" gap above, seen from the charter's
  side.

## Contract & docs fit

Living up to the contract: types are `@flighthq/types`-first (`type-home:check` reports zero exported
types outside it), exported names carry the full unabbreviated type they operate on, expected failures
return sentinels rather than throwing, the manifest declares `sideEffects: false` and exactly the two
blessed lanes, registration is an explicit `registerSwfScene2DDocumentImporter` call with no module-load
side effect, and the guard seam is contract-only while the guard module is public. `npm run check swf`
passes every gate; run `npm run test swf` for the current count.

Candidate revisions to the contract and admin docs themselves:

- **`charter.md` has no `## North star` section** and `docs:check` warns on it (non-gating). The charter is
  a "reserved home" document written before the package existed; the package has since been built. Adding
  one is a direction decision, not a survey edit.
- **The two charter divergences above** are candidate charter revisions rather than code defects — the
  options parameter and the `importdiagnostics` dependency line.
- **The cell carries three supplementary docs** — `fixture-evidence.md`, `tag-coverage.md`, and
  `sha-pin-incidental-audit.md` — which `docs:check` warns are "not a contract file". They are load-bearing
  here (the fixture record is what keeps the corpus claims reproducible without committing a binary), so
  the warning reads as a contract that does not yet describe a cell with supplementary evidence docs.

## Candidate open directions

Questions the charter does not answer that this survey had to assume:

1. **Where does a placement ratio live when the placed character is not a morph?** SWF overloads one field
   across two quantities — morph progress and video frame selection. The charter's scope line lists
   `PlaceObject*` state without naming ratio at all.
2. **Is `createScene2DFromSwf` intended to take import options?** If so, what is the first option that
   earns the parameter; if not, the charter's entry line should lose it.
3. **Does this package owe structured import diagnostics, and through which seam** — the chartered
   `importdiagnostics` layer, or the `@flighthq/log` guard layer it actually uses?
4. **How far does "codec, not a player" reach into evidence?** All current real-file evidence measures the
   constructed tree. Whether a reference-player pixel comparison is in scope for a codec cell, or belongs
   to the functional-scene layer, is unstated.
5. **Do supplementary evidence docs belong in a cell**, and if so should the cell contract name them rather
   than warn on them?
