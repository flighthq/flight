---
package: '@flighthq/scene2d-formats'
updated: 2026-08-05
basedOn: ./review.md
---

# scene2d-formats — Assessment

## Audit basis

This assessment was checked against `packages/scene2d-formats/src`, its boundary types, colocated tests,
the shared resource seam, and the functional scenes. The systematic Lottie/SVG source pass is pinned to
Flight `28301ec6d`; the Rive corpus and functional-scene evidence remains pinned to Flight `a3707655f`.
Historical corpus statements below name the Flight commit that recorded them; they are evidence from
that revision, not floating claims about an unnamed checkout.

The current Rive measurement is reproducible without committing external bytes: clone
`https://github.com/rive-app/rive-flutter.git`, check out
`fc9fd0445a205092ad340491d48ec16f42d2562e`, find every `*.riv`, and accept only files beginning with
the `RIVE` fingerprint. The checkout holds 42 paths, 4 of which are pointer text rather than Rive
bytes, leaving 38 files. The SHA-256 of the sorted `sha256sum` manifest for all 42 paths is
`5625f3d481aa22ad9f0c736725ac021e901853136fe2fd9e8f31db2cdf30b31e`. All current Rive counts in this
assessment were measured at that corpus commit against Flight `a3707655f`; no corpus file entered the
repository.

## Findings that invalidate the old ranking

The previous assessment is not a safe work queue. Its highest-value recommendation was to create the
coverage document, audit Lottie diagnostics, correct the charter, add a format-derived invariant,
split out the conformance census, implement polystar roundness, and preserve every paint. Every one of
those items is now present in source and tests. Carrying them forward would ask a builder to rebuild
finished work.

The claimed verification asymmetry is also false. At Flight commit `550c1b042`, 18 real Bodymovin
exports exposed two structural parser defects; after the repair, 17 imported and the remaining file
was not an animation. At Flight commit `62359229b`, 34 W3C SVG conformance documents all produced
geometry and exposed the `inherit` defect later fixed there. Rive is not the only codec that has read
real files, so “give Lottie and SVG their first real asset” cannot remain the cell's top item. Those
older runs did not record their upstream revisions or manifest hashes, so their absolute counts are
historical evidence rather than refreshable baselines; that provenance weakness should not be hidden
by restating the old conclusion more confidently.

Several Rive gaps in the old text are likewise closed. The current artifact carries static authored
layout descriptors, multi-run rich text and variable-font axes, loop/work-area/speed metadata, stroke
dashes, intersected clips, negative corner radii, a flattened bone rig, every keyed bone axis, and a
weight reader. `createScene2DDocumentFromRiveDocument` already emits nested-artboard slots and image
resource references whose waiting texture identities are preserved. The mutable-content binder now
composes geometry and paint with all shared display channels, and `KeyFrameColor` samples four ARGB
components rather than pretending the packed integer is a scalar.

The old functional-scene claim is stale too. `functional/scenes/rive-import.ts` imports a generated
Rive file, samples its animation, and has Canvas, DOM, WebGL, and WebGPU baselines plus pixel assertions
for geometry encodings, multiple paints, clipping, corner sign, and gradient output. Lottie and SVG
still have no functional scene, but whether this Rive precedent settles ownership for the other codecs
has not been ruled.

## Current measurements, not a priority ruling

The pinned 38-file Rive run imports all 38 files into 108 artboards. It finds 8,333 keyed-property
tracks across 359 clips; the importer emits 7,617 channels and 85 clips remain empty. The old
“145 of 383 before the binder” and “112 after” figures predate bone binding and a changed corpus, so
neither describes the current artifact.

The unread or only partly connected families in the same run are:

| family | objects | files | source truth at Flight `a3707655f` |
| --- | ---: | ---: | --- |
| rig (`Weight`, `CubicWeight`, `Tendon`, `Skin`, `RootBone`, `Bone`) | 3,031 | 22/38 | bones, bone animation, and weights parse; weighted paths never enter the production import path |
| constraints (`*Constraint`) | 191 | 12/38 | names decode, but no constraint solver is built or emitted here |
| data binding (`ViewModel*`, `DataBind*`, `BindableProperty*`, `DataConverter*`, `FormulaToken*`) | 2,444 | 9/38 | a runtime binding system, not a static projection |
| text modifiers | 22 | 4/38 | modifier groups and ranges do not reach rich-text output |
| `Feather` | 150 | 3/38 | an effects-tier paint operation, not a shape field |
| mesh / vertex art | 291 | 1/38 | travels with the unresolved rig-to-display bridge |

The rig row is the most important source correction. `PathAttachment2D` and
`deformSkeleton2DPathAttachment` already exist in `@flighthq/skeleton2d`, so the old weighted-path
*home* question is settled. `scene2d-formats` also has `createRiveSkeleton2D`, bone animation binding,
and `createRiveSkin2D`. But production source calls only the first; `createRiveSkin2D` is referenced by
its own tests and nowhere in the importer. The artifact therefore reads the pieces without attaching a
weighted path to the rig or replacing the displayed shape with its deformed coordinates. That is an
incomplete bridge, not an absent primitive and not proof that rigging is visually covered.

The adjacent keyframe audit is now measured rather than speculative. At the same Flight and corpus
commits, the value subclasses the binder does not consume appear as follows:

| keyframe value | tracks | files | targets seen |
| --- | ---: | ---: | --- |
| `KeyFrameId` | 50 | 10/38 | Solo active child, draw-rule target, text-run style |
| `KeyFrameUint` | 34 | 3/38 | layout-style enum and sizing fields |
| `KeyFrameString` | 13 | 2/38 | text-run content |
| `KeyFrameBool` | 8 | 2/38 | nested-animation enablement and a custom boolean |
| `KeyFrameCallback` | 18 | 5/38 | audio/event callbacks and one script input |

These rows explain only 123 of the 716 keyed-property tracks that emit no channel. The remainder are
mostly double or colour values aimed at systems the static geometry/paint binder does not own, including
constraints, layout refresh, text modifiers, data binding, and feather. Widening the value reader alone
would therefore recreate the original `KeyFrameColor` failure in another form: a populated track with no
evidenced target meaning.

## Ranking versus ruling

The audit removes the old top priority and does **not** choose a replacement. The remaining evidence is
not one comparable queue:

- The Rive weighted-path bridge has the largest measured file share above, and its target primitive now
  exists, but the output/binding contract between a deformed attachment, the imported display shape, and
  explicit playback still needs to be stated before implementation.
- The 716 unbound Rive tracks are a mixed population. Some target visible local data; others target
  constraint, layout, event, audio, script, or data-binding runtimes. Their counts rank the audit work,
  not one generic binder change.
- Lottie and SVG have real-file parser evidence but no pixel-level functional scene. Rive has a
  four-backend functional scene, but it is generated from Flight-owned bytes rather than compared with a
  reference rendering. These are different evidence gaps, not a numeric fidelity ordering.

Choosing among those would be a product or architecture ruling. The evidence that would settle the
choice is respectively: a named rig-to-display contract and real rigged-file comparison; a per-target
keyframe census with intended runtime owners; or a decision that the Rive functional-scene precedent
authorizes equivalent Lottie/SVG scenes and what reference pixels they must prove.

## Backstop result

The pre-authorized Lottie/SVG silent-drop probe found two bounded defects inside features the charter
already calls covered:

- `LottieGradient.k` explicitly types colour stops followed by optional opacity-stop pairs, but the
  importer allocated exactly `p * 4` components. That truncated the opacity tail both initially and in
  the mutable animation binder. The parser now preserves the full packed vector, interpolates opacity at
  every colour stop, and multiplies it by overall paint opacity. Exact static and halfway-through-animation
  assertions pin the resulting alpha arrays. Radial highlight angle/length (`a`, `h`) remain typed but
  unread; their mapping needs a format-derived focal-point relation rather than a guess.
- A resolved SVG `<image>` always scaled its intrinsic width and height independently, silently treating
  the element as `preserveAspectRatio="none"`. Image placement now reuses the importer's existing viewBox
  rule. A 20×10 resource in a 100×100 viewport maps to uniform scale 5 and centered y=45 by default;
  explicit `none` retains scale 5×10 at y=20.

Coverage now distinguishes those repaired drops, the remaining Lottie radial-highlight gap, the current
pinned Rive baseline, and the historical unpinned Lottie/SVG and older Rive corpus counts.

## Systematic SVG/Lottie silent-drop completion

The backstop was completed as a field-to-consumer read-through, not stopped after the first two defects.
Flight `b0bca6552` carries the bounded source fixes: nested Lottie group names; solid-stroke static dash,
offset, cap, join, and miter data; SVG HSL/HSLA and percentage alpha; and computed `currentColor` for
gradient stops. Flight `28301ec6d` corrects the Lottie boundary type and applies the same line-style data
to gradient strokes. Animated dash remains undashed and uses the existing author-actionable modifier
diagnostic rather than freezing its first keyframe.

Every other candidate examined is listed below. “No loss” means the value was followed through its
consumer rather than merely absent from the gap list. “Left” names the reason it was not turned into an
implementation choice.

| codec path or field | disposition | named reason |
| --- | --- | --- |
| Lottie solid stroke `d`, `lc`, `lj`, `ml` | fixed at `b0bca6552` | Static line styling maps directly onto existing shape/path commands. |
| Lottie gradient stroke `d`, `lc`, `lj`, `ml` | fixed at `28301ec6d` | The fields were missing from the boundary type even though the gradient-stroke output uses the same line-style seam. |
| Lottie nested shape-group `nm` | fixed at `b0bca6552` | A nested group already creates a one-to-one display container that can carry its name. |
| Lottie animated dash entries | left, declared exclusion | Sampling dash arrays would require a mutable path rebuild contract; freezing the first keyframe would misstate animation. The existing modifier diagnostic remains. |
| Lottie keyframe `ti` / `to` | left, unread | Tracks represent value samples and temporal easing, not a spatial motion-path target; endpoints survive but curved trajectories do not. |
| Lottie transform `sa` | left, unread | Skew axis changes transform composition; assigning it to `skewX` would be a guessed relation. |
| Lottie separated `z` and layer/document `ddd` | left, declared exclusion | The importer emits a 2D display tree and has no 3D layer projection contract. |
| Lottie gradient highlight `a` / `h` | left, unread | A focal-point mapping must account for radial gradient geometry and transform; no format-derived relation is present here. |
| Lottie text `sc` / `sw`, document `chars` / `fonts` | left, known gap | `TextFormat` emission is fill-only and embedded glyph outlines need a font/glyph resource seam. |
| Lottie text `a` / `m` / `p` and multiple text documents | left, declared exclusion | These describe animator/layout runtime behavior; selecting one static document is the current contract. |
| Lottie mask `o` / `f` / `x`, composed modes, inversion | left, known gap | Flight's emitted `ClipRegion` is a hard clip and cannot encode opacity, feather, expansion, or Boolean mask composition at this seam. |
| Lottie `ef`, `tt` / `td`, `tm`, audio, camera | left, declared exclusions | They require effects, matte composition, time-remap, audio, or camera runtimes rather than a local field assignment. |
| Lottie precomposition asset `w` / `h` | left, unread | Child timing and layers survive, but turning the asset rectangle into a viewport requires a clipping contract. |
| Lottie path/paint item `nm` | left, metadata loss | Group paths and paints consolidate into one emitted `Shape`; no one-to-one node exists for each item name. |
| Lottie shape `ix` / `ind` and group `np` | examined, no visual loss | They are expression/property indices or a declared count, not display values; expressions remain excluded. |
| Lottie image asset `e` / `u` / `p` / dimensions | examined, no codec loss | The entire typed image asset reaches the injected resolver, which owns URL/data-URI interpretation and intrinsic pixels. |
| Lottie markers `cm` / `dr` / `tm` | examined, no loss | All three reach the emitted clip event name, duration, and time. |
| Lottie document `nm` / `v` | left, metadata-only | The import result has no document-name/schema-version fields; neither changes emitted scene pixels. |
| SVG geometry, transforms, `use`, gradient inheritance, image `href` | examined, no loss found | Each attribute family reaches its path, matrix, reference resolver, or injected image seam; image aspect mapping was repaired in the predecessor audit. |
| SVG HSL/HSLA and percentage RGB alpha | fixed at `b0bca6552` | They are CSS colour syntax with a direct mapping to the existing RGB/alpha paint representation. |
| SVG gradient-stop `currentColor` | fixed at `b0bca6552` | Definition ancestry already computes `color`; the stop parser had bypassed it. |
| SVG radial-gradient `fx` / `fy` | left, parsed then unused | Converting focal coordinates needs a focal-ratio relation across object-bounds/user-space coordinates and the gradient transform. |
| SVG `switch` predicates | left, unread | Feature, extension, and language selection needs a caller environment and fallback policy; emitting all children remains explicitly documented. |
| SVG complex CSS selectors | left, unread | A correct descendant/child/sibling/attribute/pseudo implementation is a selector engine, not an extension of the simple matcher. |
| SVG `!important` | left, parsed away | Importance must participate in origin/specificity/order as cascade metadata; stripping or blindly winning both give wrong cases. |
| SVG named colours outside the local table | left, unread | A complete CSS table exists only behind another package's private resolver; copying it or creating a shared colour resolver is a dependency/ownership decision. |
| SVG stylesheet `stop-color` / `stop-opacity` | left, unread | Computed `SvgStyle` has no stop-paint fields; inline attributes/styles and inherited `color` are the current definition seam. |
| SVG percentage and relative length units | left, partially read | `parseFloat` preserves numeric prefixes but property-specific reference boxes and font/viewport unit contexts are absent. |
| SVG viewport overflow and mask region | left, unread | Viewports without `viewBox` are not clipped; `maskUnits` plus region `x`/`y`/`width`/`height` need viewport-region composition beyond `maskContentUnits`. |
| SVG text stroke and advanced text layout | left, unread | `TextFormat` emission carries fill/font/alignment, while baselines, spacing, direction, rotation, and per-glyph positioning need the text-layout seam. |
| SVG `vector-effect` / `paint-order` | left, unread | Non-scaling stroke requires transform-aware paint evaluation and paint ordering requires separate fill/stroke emission order. |
| SVG distinct rectangle `rx` / `ry` | left, approximated | The available round-rectangle helper takes one circular radius; using one value cannot preserve elliptical corners. |
| SVG paint-server fallback tokens | left, unread | `url(...)` parsing resolves only the server id; selecting a fallback paint requires a tokenized paint grammar. |

This table is evidence, not a replacement ranking. It deliberately records the remaining semantic and
runtime forks without choosing them while the approval gate is empty.

## Recommended

Do not start a generic Rive binder widening or silently invent the rig-to-display contract. The backstop
improved the artifact and evidence but does not make the remaining Rive bridge, unbound runtime tracks,
or Lottie/SVG functional-scene work comparable. No replacement priority is selected here.

## Backlog after a ruling

- Connect Rive weighted paths to the existing `PathAttachment2D` deformer once the display/playback
  contract is explicit, then rerun the pinned corpus and a real rigged-file visual comparison.
- Bind non-double Rive keyframes only per evidenced target family; never through a scalar fallback.
- Add Lottie and SVG functional scenes if their ownership and reference-oracle requirements are ruled.
- Keep constraint solvers, data binding, state-machine execution, callbacks, and scripted interpolation
  out of the codec until their runtime homes are chartered.
- Route feather through the effects tier and text modifiers through the text/runtime seam only when those
  target vocabularies can preserve what the file states.

## Approved

_Empty — approval is the user's gate._
