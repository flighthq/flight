---
package: '@flighthq/scene2d-formats'
draft: false
lastDirection: 2026-07-25
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# scene2d-formats — Charter

## What it is

`@flighthq/scene2d-formats` imports visual-authoring documents into Flight display-object trees.
It owns document-level structure and presentation above the narrower path/shape codecs: containers,
text, reusable definitions, gradients, clips/masks, resource references, and transforms.

The first and current format is static SVG-document import. This is the reusable interchange
path for Figma, Adobe XD, Canva, and other design tools that export SVG. SVG path data remains owned
by `@flighthq/path-formats`; this package composes it into a complete display subtree.

## North star

- Input is an authoring artifact; output is ordinary Flight data and display nodes, never a live
  document runtime.
- Imports are deterministic and side-effect-free. External resources resolve only through explicit
  caller seams; parsing performs no network or filesystem I/O.
- Lenient authoring-tool variance is preserved when Flight has an equivalent and reported through
  structured `ImportDiagnostic` crumbs when it must be skipped, dropped, or recovered.
- Geometry delegates to `path`/`path-formats`, drawing to `shape`, text to `text`, hierarchy to
  `scene2d`/`node`, and hard geometry masking to `clip`.

## Current SVG scope

Whole-document SVG: paths and primitive geometry, fills/strokes/dashes, linear/radial gradients,
groups/nested SVG, transforms/viewBox/preserveAspectRatio, presentation attributes and common CSS
selectors, defs/use/symbol, text/tspan style runs, images through an explicit resolver, clipPath, and
mask recovery to Flight's hard clip primitive.

The compatibility bar is the core static subset emitted by common design tools such as Figma,
Adobe XD, and Canva: shapes and paths, transforms, fills and gradients, basic clips and masks, text,
use, and symbol. Exotic clip/mask composition is a chartered later deepening item, specifically
nested clip intersections, clip-rule inherited from definition ancestors, and text used as clip
geometry. Implementations may preserve those cases when they can resolve them correctly, but they
are not part of the core compatibility guarantee.

An unresolvable case must be **recorded honestly**, and where it is recorded follows the
asset-fact/project-fact split in
[diagnostics](../../conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts). A
case that is unresolvable because of what *this file* contains — a dangling reference, a cycle, a
resolver the caller did not supply — emits an accurate `ImportDiagnostic` crumb, and must not
mislabel a resolved-empty clip as an unresolved reference. A case that is unresolvable because *we
have not built it yet* is a project fact: it would fire on every idiomatic export using that
feature, so it belongs in
[scene2d format coverage](../../scene2d-format-coverage.md), not in every consumer's diagnostic
stream. Silence plus a coverage entry is the correct outcome there; silence alone is not.

SVG animation, scripts, foreignObject, live DOM behavior, and filter graphs are not retained. Filter
effects belong to `@flighthq/effects`; application behavior remains application-owned.

## Lottie scope

The Lottie module accepts Bodymovin JSON or the data-only `LottieDocument` boundary type and returns
a display subtree plus animation data. It performs no playback and acquires images only through
`LottieDocumentImportOptions.resolveImageResource`.

The common Bodymovin export path is the AAA baseline: shape, precomposition, image, null, solid, and
text layers; parenting and 2D transforms; static and animated paths, fills, strokes, gradients,
trim paths, basic masks, and composition markers as clip events. Document frame `f` maps to seconds
as `(f - ip) / fr`; duration is `(op - ip) / fr`. Nothing disappears unrecorded: a record dropped
because of what *this file* contains crumbs, and a record dropped because the codec does not carry
that feature is written down in
[scene2d format coverage](../../scene2d-format-coverage.md).

Expressions, text animators, effect layers, audio, cameras, 3D transforms, exotic mattes, blend
modes with no Flight equivalent, arbitrary time remapping, and shape modifiers without a Flight
equivalent are all outside the baseline. Static hard masks may recover to `ClipRegion`. These scope
exclusions are deliberate up front; none authorizes parser work before review resolves the forks
below.

### Mapping decisions

1. **Segment-local temporal easing.** Map Bodymovin cubic-Bezier handles analytically through
   segment-local easing on `AnimationTrack`. Split vectors into scalar tracks only when their
   component handles differ. Dense baking is a fallback only for a genuinely unrepresentable curve.
2. **Animation target ownership.** Transform and opacity bind through the general
   `Node2DAnimationTarget` and `applyAnimationClipToNode2D` in
   `@flighthq/scene2d`. Format-owned targets remain only for properties above that package,
   such as mutable shape, paint, and text data.
3. **Precompositions and time remapping.** Flatten ordinary precomposition channels into root time,
   folding constant layer offset and stretch exactly. Arbitrary animated time remapping is an honest
   Skip site; no speculative time-map primitive or lossy resampling enters the baseline.
4. **Package home.** The reserved `lottie-formats` charter is absorbed here, matching
   `svg-formats`. Lottie is a parser within the display-object document codec rather than a neighbor
   of a nonexistent Lottie runtime model.

## Rive scope

Rive `.riv` is the **richest source** and the primary **modern named-graph (#3)** authoring path —
absorbed here from the reserved `rive-formats` cell. Format parse only: `.riv` bytes → vector shapes
(`shape`), rig deformation (see below), animations (`animation`), and a `Scene2DDocument` whose slots
+ linkage come from Rive's named + nested artboards. Rive's **state-machine runtime** (inputs driving
transitions) is a *runtime interpretation*, not a parse — it stays a distinct future runtime cell (the
node/sim split, à la `particles`/`particleemitter`); this codec emits the state-machine *descriptor* as
data only.

**Rig deformation has no home yet, and this scope originally named the wrong one.** It read
"deformable meshes + bones/skinning (`skeleton2d` — 2D mesh warp / `MeshAttachment2D`)", which the
2026-08-03 measurement disproved: Rive skins **vector paths**, not textured meshes. 251 of 263 skins
in the reference corpus hang off a `PointsPath` against 12 off a `Mesh`, and 1,486 of 1,738 weights
sit on path vertices against 252 on mesh vertices; only 2 of 64 files hold a mesh at all.
`MeshAttachment2D` is a Spine triangle mesh with per-vertex UVs, and both are meaningless for a
weighted bezier path. Rive's bones are also `TransformComponent`s inside the artboard tree, where
`Skeleton2D` deliberately owns a decoupled flat bone array. What is missing from Flight is a
**weighted vector path**; where that belongs — `skeleton2d`, `path`, or a new primitive — is an open
direction below, and the 3D `mesh`/`skeleton3d` remain excluded either way. Details in
[scene2d format coverage](../../scene2d-format-coverage.md).

## Decisions

- **[2026-07-25] Package name and first format.** User-directed review queue named
  `@flighthq/scene2d-formats` as the home and directed full SVG-document import first.
- **[2026-07-25] One target package, many source codecs.** SVG, Lottie, and Rive are **codecs within
  `scene2d-formats`**, never separate source-named `*-formats` packages — `-formats` is target-named
  (this package produces 2D display / `Scene2DDocument` data), exactly as `scene3d-formats` holds
  glTF/OBJ/USD/3DS/MD5/AWD2. This supersedes the reserved `svg-formats`, `lottie-formats`, and
  `rive-formats` cells. SVG is the first increment; Lottie, then the richer Rive, are later increments.
- **[2026-07-25] A huge source domain graduates to its own package; SWF did.** The codec-in-cell rule
  holds for **bounded** formats that share the cell's infra and read well beside their siblings. A
  source that is a *huge, distinct domain* (its own data model, big surface) graduates to a **domain
  package** — domain-named, never `-formats`-suffixed — exactly as `movieclip`/`sprite` are their own
  packages despite sharing the `Node2D` contract. **SWF took this exit →
  [`@flighthq/swf`](../swf/charter.md)** (a peer that produces `Scene2DDocument` over the shared layer,
  depending on neither this cell nor it on `swf`). The test: shares this cell's infra and reads well
  beside its siblings → codec here; a domain that would bloat the cell and wants its own greppable
  space → its own package. Rive stays a codec for now, graduating only if it earns it by measurement.
- **[2026-07-25] Heavy binary deps inject through seams, not packages.** A codec's heavy dependency
  (e.g. Rive's `.riv` binary reader) is injected via a registered seam (the
  `registerAwd2DeflateDecompressor` precedent in `scene3d-formats`), so the codec stays in this package
  while the dependency stays optional and tree-shakeable. A source's *weight* alone never earns a
  source-named package — but its *domain size* can earn a domain package (above).
- **[2026-07-25] No hidden resource acquisition.** SVG `<image>` values resolve through
  `SvgDocumentImportOptions.resolveImageResource`; unresolved images emit structured diagnostics.
- **[2026-07-25] Core-subset SVG compatibility.** The user set the AAA bar at the static subset
  produced by common design-tool exports. Nested clip intersections, definition-ancestor clip-rule
  inheritance, and text-as-clip geometry are deferred exotic composition. Working correct support
  may remain, while unsupported variants must degrade through honest Skip diagnostics.
- **[2026-07-25] Lottie charter blessed.** Segment-local analytic easing, the shared display-object
  animation binder, flattened ordinary precompositions, diagnosed arbitrary time remapping, and
  absorption of the reserved `lottie-formats` home are the implementation rules.
- **[2026-07-25] Named-graph output mode (#3) is a third import contract, homed in
  `scene2d-resources`.** This charter's North star (straight to `Node2D` nodes, no duplicate
  normalized document) covers the **flat-graphic** and **animation** contracts. A third contract — a
  **named node graph** of slots code fills at runtime — defers realization behind an enumerable
  `Scene2DDocument`. Its boundary type, resolve pipeline, and named-slot seam are chartered in
  [`scene2d-resources`](../scene2d-resources/charter.md); this cell contributes the shared parse
  front-end and a named-graph *output mode* (emit a `Scene2DDocument` with slots + linkage instead of a
  realized tree). No conflict with the North star: the document is static plain data, it only defers
  *when* nodes realize. User-directed 2026-07-25 (named-2D-node-graph design session).

## Open directions

1. Exotic clip/mask deepening: nested intersections, definition-ancestor clip-rule inheritance, and
   measured text clip geometry.
2. SVG paint-server patterns and soft/luminance mask fidelity beyond Flight's hard `ClipRegion`.
3. A real-asset Lottie demo and fidelity checkpoint after the hand-authored conformance gate.
4. Rive's **state-machine runtime** — the interactive descriptor the Rive codec emits needs a distinct
   *runtime* cell to consume it (the parse/runtime split's second half; not a `-formats` concern — the
   one Rive piece that does not fold into this package). See the superseded
   [`rive-formats`](../rive-formats/charter.md) for that open thread.
5. The named-graph output mode's slot/linkage handshake, shared across the SVG-from-XD and Rive codecs
   and the [`@flighthq/swf`](../swf/charter.md) peer through the one `Scene2DDocument` slot contract
   ([`scene2d-resources`](../scene2d-resources/charter.md)).
6. **Where a weighted vector path belongs.** Rive's rigging deforms bezier paths by bone influence,
   which no Flight primitive models — `skeleton2d` carries a Spine triangle mesh instead. Whether this
   is a `skeleton2d` attachment kind, a `path` capability, or a new primitive is the decision that
   unblocks Rive rigging, and it would serve any other path-deforming source.
7. **Whether `Node2D` should carry an explicit draw index.** Rive reorders drawables within a flat
   artboard draw list and 83 of 96 overrides in the corpus cross a parent boundary, which Flight's
   child-order z-ordering cannot express without reparenting. A draw index, or a flattened render
   list, would settle it; the same question would reach any format with a draw list independent of
   hierarchy.
8. **Whether a `-formats` cell owns its functional render scenes.** No codec in this cell has one, so
   nothing here is verified at the pixel level on any backend — the widest structural hole for a cell
   whose whole output is visual.
9. **Whether a third-party corpus may be committed as a fixture.** Rive's reference assets are MIT,
    which permits redistribution but requires carrying the notice. Until that is decided the corpus is
    fetched on demand and its runs are reproducible rather than standing in CI.
