---
package: '@flighthq/scene2d-formats'
updated: 2026-08-03
by: builder
---

# scene2d-formats — Status Log

> Append-only handoff log, newest entry on top.

## 2026-08-03 — Rive: three items closed as design questions rather than code

Draw-order overrides, rigging, and the blend-mode shortfall each turned out to need an answer above
this codec, so each is recorded in [coverage](../../scene2d-format-coverage.md) with its measurement
rather than approximated.

**Draw order.** `DrawRules`/`DrawTarget` move a drawable within Rive's *flat* artboard draw list, and
83 of 96 cross a parent boundary. Flight expresses z-order as child order within a parent, so
honouring one means reparenting, which changes the transform. Reading the properties is trivial; the
mismatch is what blocks it. Wants an explicit draw index on `Node2D`, or a flattened render list.

**Rigging.** The charter routes this to `skeleton2d`'s `MeshAttachment2D` and told us to check the fit
first. It does not fit: Rive skins **vector paths**, with 251 of 263 skins on a `PointsPath` against
12 on a `Mesh`, and 1,486 of 1,738 weights on path vertices against 252 on mesh vertices. Only 2 of
64 corpus files hold a mesh at all. `MeshAttachment2D` is a Spine triangle mesh with UVs; both are
meaningless for a weighted bezier path. Rive's bones are also `TransformComponent`s in the artboard
tree, where `Skeleton2D` owns a decoupled flat bone array. Flight lacks a **weighted vector path**,
and a lossy mesh approximation would look plausible and be wrong.

**Blend modes.** Rive states sixteen, Flight carries six; 93 of the 144 non-default uses in the corpus
have nowhere to land. Recorded rather than crumbed, because the cause is our own enum. The same
question hangs over the `lottie.unsupported-blend-mode` crumb Lottie still emits.

## 2026-08-03 — Rive: assets, state machines, text

Assets forced a **container fix**: text and blobs share one wire code, because the table of contents
has two bits per property and only says how many bytes to skip. The reader was decoding binary
payloads as UTF-8. Which a property is comes from the object model, so blob-typed keys are now kept
whole. Verified by magic number — 89 payloads totalling 15 MB, every one valid for its kind.

State machines are described as data only, per the charter. The corpus caught a naming bug on the
first run: all 98 machines came out unnamed, because `StateMachine` extends `Animation` and takes
*its* name key, while layers and inputs use the state-machine component's.

Text imports as a single-format label from the drawable's value runs. Rich text — runs differing in
style — is uncovered, as is the font a style names.

**The recurring hazard in this format is id spaces, and there are now four.** `parentId` indexes
components; `interpolatorId` indexes all artboard objects; `assetId` indexes the asset list by order;
`styleId` indexes components. Each was established empirically, and inheriting a space from a sibling
property would have been wrong three times in four.

## 2026-08-03 — Rive: the visual and animation layers

Paths with all four cubic vertex kinds and the parametric family; straight-vertex corner rounding;
ordered paint; clipping; trim; linear animations as named clips; a version gate.

Two wire facts that a guess would have got wrong. Cubic handles are **polar**, and the three cubic
kinds disagree on sign — mirrored and asymmetric subtract the incoming vector while detached adds its
own. Corner rounding is the format's own "natural rounding", whose general form is confirmed by
collapsing to the 0.5523 circle ratio at a right angle.

Paint is modelled as an **ordered list from the start**, which the corpus justified immediately: 429
of 2,409 shapes carry more than one paint, and a slot-per-kind model would have lost paint on every
one. That is the bug Lottie needed retrofitted.

Clipping's substance is coordinate space: Flight rasterizes a clip under the *clipped* node's
transform while Rive states the geometry in the *source* shape's chain, so the geometry crosses
chains. Both chains measure from the artboard root, whose transform cancels.

Only transform properties bind to animation, which is why 145 of 383 clips carry no channels — they
animate geometry or paint, which needs a format-owned mutable-content binder like Lottie's.

## 2026-08-03 — Rive: container, types and graph, verified against real files

`parseRiveDocument`, the 368-type registry with its inheritance, and per-artboard component trees.

**The corpus is what made this real.** The container passed 30 synthetic tests while unable to read a
single real file: it treated the file's table of contents as the source of property widths, when the
table is only a *supplement* and a typical file ships an empty one. A reader needs the object model's
own width table, and that table must include **alternate** keys — `Node.x` is key 13 today and was 9,
and omitting alternates failed 11 of the first 40 files on that key alone.

Verified against 64 real editor-authored files (MIT-licensed Rive Android test assets, fetched on
demand and not committed — carrying them would mean carrying the notice, which is a licensing call).
All 64 decode: 82,543 core objects, 37,595 components, no unresolved parent.

## 2026-08-02 — Lottie maturity audit, and the fixes it produced

Audited against the charter and found five common-path features silently lost, each proved by diffing
the emitted command stream against the reduced document. The user corrected the proposed remedy, and
correctly: a crumb reports what happened to *this file*, while a gap in our coverage is a project fact
belonging in a document. That rule is codified in
[diagnostics](../../conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts) and
all five fail its mechanical test, so none became a crumb.

The result was the missing [scene2d coverage doc](../../scene2d-format-coverage.md) — the sibling of
the 3D one, and the reason those gaps were recorded nowhere — plus retirement of 14 project-fact
crumbs that fired on correct idiomatic exports, ordered paint entries, and polystar roundness.

**A real bug in attested work, found later while cross-checking Rive units:** the Lottie importer
converted rotation and skew degrees→radians into `Node2D.rotation`, which is degrees, so a 90° layer
rendered at 1.57°. It survived because the tests took their expected value *from the conversion* —
including the format-derived invariant added during the audit. An invariant is only as independent as
its weakest axis, and the destination field's unit contract is a separate fact from the source
format's relation.

## 2026-07-25 — Lottie common-path implementation

Implemented Bodymovin JSON import as a display subtree plus target-bound `AnimationClip`, with an
explicit apply function. The common-path census covers all baseline layer families, hierarchy,
static/animated 2D transforms, analytic segment/component easing, path/primitives, fill/stroke and
gradient animation, trim paths, hard masks, image resolution, ordinary precomposition timing, and
markers. The predeclared exotic set emits structured diagnostics.

Added general segment-local `AnimationTrack` easing and the additive
`Node2DAnimationTarget`/`applyAnimationClipToNode2D` target-owner binder. Focused tests
pass 46 cases across animation, display binding, and Lottie import; full repository check and all
12,874 tests pass. A real asset remains intentionally deferred to the post-gate demo checkpoint.

## 2026-07-25 — Lottie charter blessed

Review approved analytic segment-local easing, a general display-object animation binder, ordinary
precomposition flattening with exact constant offset/stretch, diagnosed arbitrary time remapping,
and absorption of the reserved `lottie-formats` charter. Implementation proceeds types-first and
TDD against hand-authored Bodymovin fixtures; a real asset waits for the demo checkpoint.

## 2026-07-25 — Lottie charter/type scope only

Drafted the proposed Lottie module boundary without implementing a parser. Added data-only
Bodymovin schema and import-contract types to `@flighthq/types`, retaining source field names so
import need not allocate a second normalized document.

Surfaced four decisions for review: segment-local/component-local easing cannot fit the current
track-wide `AnimationTrack.easing`; animated target ownership must avoid reversing
scene2d/shape dependencies; arbitrary precomposition time remapping needs either an explicit
primitive or diagnosed resampling; and the reserved `lottie-formats` charter should be marked
absorbed only after blessing.

## 2026-07-25 — SVG conformance matrix sweep

Added a systematic conformance matrix spanning shape, image, text/tspan, group, use, symbol, and
nested-use across transform composition; clipPath target bounds, winding, use instantiation, and
render-state exclusion; hard-mask recovery; CSS cascade/inheritance; display/visibility; and
root/nested/symbol viewports. Together with the focused SVG and XML suites the sweep covers 86 tests.

The matrix surfaced one additional output issue before re-gating: a `visibility:hidden` container was
made invisible, preventing a descendant `visibility:visible` override. Containers now remain
traversable for visibility inheritance while `display:none` still suppresses the subtree. Added
display cells for every element family and mask/clip reference cells for path, symbol, and nested use.

The three round-three clip blockers are fixed: fill-rule and clip-rule keep independent inherited
state while sharing the winding parser; clip geometry recursively instantiates use references with
x/y, transforms, symbol viewports, nested-use support, and cycle protection; computed display and
visibility now exclude the correct clip/mask geometry.

## 2026-07-25 — cross-cutting SVG interaction pass

Replaced the element-specific round-one repairs with shared category paths. All display nodes now
compose authored transforms after their geometry/placement matrix through one function. Clip/mask
application is deferred until the target subtree exists, with recursive local bounds for shapes,
images, groups, and nested uses; targets without honest bounds (currently text without a registered
font measurer) emit a structured skip rather than applying objectBoundingBox coordinates incorrectly.

Fill and clip winding share one inherited resolver, including nested clip groups and a mixed-winding
recovery crumb. The ordered text-run builder now preserves raw XML mixed-content order, applies SVG
newline removal and whitespace collapse across tspan boundaries, composes text placement before its
transform, and diagnoses flattened tspan spatial attributes. Use instantiation scans the referenced
definition subtree so unsupported live descendants cannot hide in defs.

Added five literal round-two regressions plus cross-element category coverage for shape/image/use/text
transform composition; image/group/nested-use objectBoundingBox clipping and honest text fallback;
inherited fill/clip winding; ordered/whitespace-aware text; and used-symbol live features. Focused
SVG/XML suites pass 47/47 and the monorepo build passes.

## 2026-07-25 — authoritative SVG gate repairs

Resolved the nine interaction failures from review2: root presentation inheritance, author-CSS
cascade precedence/source order, inherited fill-rule, image and use transform composition, symbol
viewBox/use viewport sizing, mixed text/tspan source order, applied-filter and nested-animation
diagnostics, and objectBoundingBox clip/mask-content mapping.

Mixed XML content now has an ordered `XmlElement.content` projection while the existing `children`
and `text` projections remain intact. Added one focused regression per reported interaction; SVG/XML
focused suites pass 41/41, the monorepo build passes, and `npm run check` is green.

## 2026-07-25 — static SVG document importer

Created the package and `createScene2DFromSvgDocument`. The importer assembles SVG document
structure into DisplayObject/Shape/TextLabel/RichText/Bitmap nodes, delegates path data to
`path-formats`, and reports format loss through opt-in `ImportDiagnostic[]` crumbs.

Implemented geometry primitives, solid and gradient fills/strokes, dashed strokes, inherited
presentation styles plus basic id/class/tag CSS, affine transforms, viewBox/preserveAspectRatio,
defs/use/symbol, styled tspan runs, explicit image-resource resolution, clipPath, and mask-to-hard-clip
recovery. Current deliberate gaps are SVG filter graphs, patterns, soft/luminance masks, live
animation/scripting/foreignObject, and independently positioned later tspans (flattened with a crumb).
