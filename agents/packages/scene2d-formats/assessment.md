---
package: '@flighthq/scene2d-formats'
updated: 2026-08-04
basedOn: ./review.md
---

# scene2d-formats — Assessment

## Audit basis

This assessment was checked against `packages/scene2d-formats/src`, its colocated tests, the shared
resource seam, and the functional scenes at Flight commit `a3707655f`. Historical corpus statements
below name the Flight commit that recorded them; they are evidence from that revision, not floating
claims about an unnamed checkout.

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
