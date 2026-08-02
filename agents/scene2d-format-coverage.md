# Scene2D Format Coverage — What Each Importer Reads, and What It Does Not

Read this before assuming a `@flighthq/scene2d-formats` importer carries a feature, before scoping work
on one, and before adding a diagnostic that would announce a gap listed here.

This is the durable answer to "does Flight import Lottie repeaters?" — a question a reader should not
have to reconstruct from a changelog. The per-package `status.md` records *when and why* coverage
changed; this records *what is true now*. When they disagree, this file is wrong and should be corrected
from source.

**A gap here is a project fact, not an asset fact.** That distinction is the rule in
[diagnostics](conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts): a crumb tells
a consumer what happened to *their file*; a gap in our coverage that would fire on every well-formed file
of the format belongs in this document instead, where it costs a shipped app nothing. The mechanical
test is whether a correct, idiomatic file from that format's own authoring tool would trigger it.

The 3D sibling is [scene3d format coverage](scene3d-format-coverage.md).

## No real asset has been imported by either codec

Both codecs were built and gated entirely against hand-authored fixtures. Unlike the 3D importers, which
have the `flight-reference` corpus (thin, but real), `scene2d-formats` has **no reference corpus at all** —
no `.json` Bodymovin export and no designer-tool `.svg` has ever been run through either parser. Neither
codec has a functional render scene either, so nothing under `functional/scenes` verifies either one at
the pixel level on any backend.

Everything below is therefore "correct against our own fixtures." That is a weaker claim than the 3D
document makes, and it is the single largest open question for this cell.

## Lottie (Bodymovin JSON)

`createScene2DFromLottieDocument` produces a display subtree plus a target-bound `AnimationClip`;
playback stays explicit through `applyAnimationClipToLottieDocument`.

**Covered:** shape, precomposition, image, null, solid, and text layers; layer parenting and stacking
order; static and animated 2D transforms including separated position (`p.x`/`p.y`), anchor, scale,
rotation, opacity, and skew angle; analytic segment-local cubic-Bezier easing, split into per-component
scalar tracks when component handles differ; hold (`h`) segments; layer `ip`/`op` visibility; bezier
paths, rectangles (with corner radius), ellipses, and polystars including corner roundness (`os`/`is`,
animatable); solid and gradient fills and strokes,
linear and radial, each animatable through the format-owned mutable-content binder; static dash;
static trim paths; a single additive non-inverted mask recovered to `ClipRegion`; images resolved through
the injected `resolveImageResource` seam; ordinary precomposition timing with `st` offset and `sr`
stretch folded exactly into root time; recursion-guarded precomposition references; and markers as
`AnimationClipEvent`s.

**Not covered — silent, and verified so.** Each of the following was confirmed by importing the case and
the reduced document side by side and diffing the emitted shape command stream; the loss is byte-identical
absence. None of them is announced, and per the rule above none of them should be:

- **Text stroke (`sc`, `sw`) is not read**, and **embedded glyph outlines (`chars`) are not read**.
  `chars` and `fonts` are typed on `LottieDocument` and consumed by nothing. `chars` is how a Bodymovin
  export ships text that renders without the author's font present, so a `chars`-bearing file falls back
  to whatever font the text stack resolves.

Paint is a **list** per shape group, not one of each: multiple fills, multiple strokes, and a gradient
beside a solid one all survive, and each paint restates the group's whole path set the way a Bodymovin
paint applies to every path in its group.

**Covered, with a caveat worth knowing.** Paints are emitted in the order the file lists them. Whether
Bodymovin treats an earlier item as painting *above* or *below* a later one is a z-order convention that
no relation in the data settles, and no real export has been compared, so a group with two overlapping
paints may stack inverted. A single-paint group — overwhelmingly the common export — is unaffected.

Polystar roundness is built from the relation the format
itself fixes — a polygon at 100% outer roundness is the circumscribed circle — which pins the tangent
handle to `r * (4/3) * tan(t / 4)` scaled linearly by roundness. That is verified by sampling the
emitted curve, and mutation-tested. It has **not** been compared against a real Bodymovin export, so
if Bodymovin's own roundness curve differs (most plausibly for a star's *inner* roundness, where no
circle relation constrains it) this would diverge subtly. A real-asset comparison would settle it.

**Not covered — declared exclusions.** These were scoped out in the blessed charter rather than missed:
expressions (`x`, never executed); text animators and animated text documents; effect layers (`ef`);
audio and camera layers; 3D layers, `position.z`, and skew axis (`sa`); track mattes (`tt`); blend modes
with no Flight equivalent; arbitrary time remapping (`tm`); and the shape modifiers repeater (`rp`),
merge-paths (`mm`), and rounded-corners (`rd`), plus animated trim and animated dash. Trim with `m: 2`
(individually) is approximated as simultaneous.

Masks beyond the single additive non-inverted case — multiple masks, subtract/intersect/lighten/darken
modes, inverted masks, and feather/expansion — are not composed; Flight's `ClipRegion` is a hard clip.

**Crumbs that remain, and what each means.** Everything listed above as uncarried is *silent* — the
gaps are recorded here rather than announced once per import. Eleven crumbs survive, each contingent on
what the caller's file actually contains:

| Crumb | Meaning |
| --- | --- |
| `lottie.invalid-document` | The JSON is malformed or structurally invalid. |
| `lottie.unresolved-asset` | A layer's `refId` names an asset the document does not define. |
| `lottie.unresolved-image` | No `resolveImageResource` was supplied, or it returned null. |
| `lottie.recursive-precomposition` | A precomposition references itself. |
| `lottie.text-missing-document` | A text layer carries no text document. |
| `lottie.incompatible-animated-shape-path` | Keyframes of an animated path disagree on vertex count. |
| `lottie.unsupported-layer` | A layer type outside the Bodymovin set — not a gap, an unknown. |
| `lottie.unsupported-shape-item` | A shape item type outside the Bodymovin set. |
| `lottie.unsupported-blend-mode` | The author chose a mode with no Flight equivalent; another mode works. |
| `lottie.unsupported-expression` | The author attached an expression; baking it before export works. |
| `lottie.unsupported-shape-modifier` | A repeater, merge-paths, rounded-corners, or animated trim/dash. |

The last three sit in the band the diagnostics convention keeps deliberately: the drop is contingent on
an author choice *and* the consumer has a next action. **Whether all three earn that keep is an open
ruling** — `unsupported-shape-modifier` in particular reports our own unimplemented modifiers, and
retiring it here would be defensible.

## SVG documents

`createScene2DFromSvgDocument` produces a display subtree from a static SVG document.

**Covered:** the structural elements `svg`, `g`, `a`, `switch`, `symbol`, `defs`, and `use` (recursion-
guarded), with nested viewports and `viewBox` transforms; the geometry elements `path`, `rect`, `circle`,
`ellipse`, `line`, `polygon`, and `polyline`; `text` with `tspan`; `image` through the injected
`resolveImageResource` seam; linear and radial gradients including `objectBoundingBox` units; `clipPath`
as a hard `ClipRegion`; and the non-rendering elements `style`, `title`, `desc`, and `metadata` skipped
by name.

**Not covered — declared exclusions.** SVG animation (SMIL), scripts, `foreignObject`, live DOM behavior,
and filter graphs are not retained; filters belong to `@flighthq/effects`. The charter sets the
compatibility bar at the static subset common design tools export.

**Not covered — deferred exotic composition**, each currently announced by a crumb that this document
should absorb: nested clip intersections (`svg.clip-nested-intersection-unsupported`), soft and luminance
masks approximated as hard clips (`svg.mask-as-hard-clip`), text used as clip geometry
(`svg.unsupported-clip-text`), `tspan` absolute positioning flattened (`svg.tspan-position-flattened`),
and filter references (`svg.unsupported-filter`). `svg.unknown-element` likewise fires on any element
outside the handled set, which an idiomatic authoring-tool export routinely contains.

**Crumbs that remain, and what each means.** Asset facts, contingent on the caller's document:
`svg.invalid-document`; the dangling-reference family `svg.unresolved-use`, `svg.unresolved-clip-reference`,
`svg.unresolved-gradient-reference`, `svg.unresolved-fill-gradient`, `svg.unresolved-stroke-gradient`;
the cycle family `svg.recursive-use`, `svg.recursive-gradient`; `svg.image-missing-href` and
`svg.unresolved-image`; `svg.mixed-clip-rule`; and
`svg.object-bounding-box-clip-without-bounds`.

## Rive

Chartered as this cell's third codec and **not built**. No `.riv` byte is read today. See the
[scene2d-formats charter](packages/scene2d-formats/charter.md) for its scope, and note that Rive's
state-machine *runtime* is explicitly not a codec concern.
