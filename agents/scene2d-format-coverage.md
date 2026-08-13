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

## How far each codec has been verified

At Flight commit `550c1b042`, **Lottie met real exports, and they were brutal.** Eighteen real
Bodymovin files from the lottie-web repository were run through the importer: **fourteen crashed it
and only three imported at all.** Two structural facts about how real exports are written, neither
visible to a hand-authored fixture, were the cause — see the Lottie section. After the fix, 17 of 18
imported (the eighteenth was not an animation), producing 9,522 nodes and 6,445 channels where the
same corpus previously produced 566 and 301. At Flight commit `62359229b`, **SVG met the W3C SVG 1.1
conformance suite** — 34 of its documents, covering
shapes, path data, transforms, units, gradients, painting, masking, structure, styling, and text. It
came through far better than Lottie: zero crashes, zero non-finite transform values, and every
document produced geometry on the first run. One real defect surfaced, and one gap that belongs to a
neighbouring package; both are recorded below.

Neither corpus was committed. Their upstream revisions and manifest hashes were not recorded, so the
counts are historical evidence from the named Flight revisions rather than refreshable baselines.

The current refreshable Rive baseline is Flight `a3707655f` against rive-flutter
`fc9fd0445a205092ad340491d48ec16f42d2562e`: 42 `*.riv` paths, four non-RIVE pointer texts, and 38
files beginning with the `RIVE` fingerprint. All 38 import into 108 artboards. The SHA-256 of the
sorted `sha256sum` manifest for all 42 paths is
`5625f3d481aa22ad9f0c736725ac021e901853136fe2fd9e8f31db2cdf30b31e`; no corpus bytes are committed.
Older 37- and 64-file Rive measurements retained below are explicitly historical because their
upstream revisions and manifests were not recorded.

Rive has a generated Flight-owned functional scene with Canvas, DOM, WebGL, and WebGPU baselines.
Lottie and SVG still have no functional render scene. This is an evidence asymmetry, not by itself a
priority ruling.

## Lottie (Bodymovin JSON)

`createScene2DFromLottieDocument` produces a display subtree plus a target-bound `AnimationClip`;
playback stays explicit through `applyAnimationClipToLottieDocument`.

**Covered:** shape, precomposition, image, null, solid, and text layers; layer parenting and stacking
order; hidden layers whose own content is suppressed while their spatial transform remains usable by a
parented child; static and animated 2D transforms including separated position (`p.x`/`p.y`), anchor, scale,
rotation, opacity, and skew angle; analytic segment-local cubic-Bezier easing, split into per-component
scalar tracks when component handles differ; spatial position curves (`to`/`ti`) traversed by arc length;
combined and separated-position auto-orientation (`ao`) added to authored rotation; hold (`h`) segments;
layer `ip`/`op` visibility; bezier
paths, rectangles (with corner radius), ellipses, and polystars including direction (`d`) and corner
roundness (`os`/`is`, animatable); solid and gradient fills and strokes, linear and radial, including
gradient-fill winding (`r`), packed colour and
opacity stops combined with overall paint opacity, each animatable through the format-owned
mutable-content binder; static stroke dash/offset, cap, join, and miter-limit data on solid and gradient
strokes, plus the animatable `ml2` miter-limit alternative; nested shape-group names; static trim paths; a single additive non-inverted mask recovered to
`ClipRegion`; images resolved through
the injected `resolveImageResource` seam; ordinary precomposition timing with `st` offset and `sr`
stretch folded exactly into root time; recursion-guarded precomposition references; and markers as
`AnimationClipEvent`s.

**Two things real exports do that fixtures never showed.** Both were silent-to-fatal, and both are
now pinned by regression tests.

*Animation is stated by structure, not by the `a` flag.* Across the eighteen files, **2,714 keyframed
properties carry no `a` flag against 730 that do**. Reading the flag treats those as static and hands
the caller the raw keyframe array as if it were a value — nonsense for a number, and no `v` at all
for a shape path. Detection is now structural: a keyframe list holds objects stating a frame `t`,
where a static value is a number, an array of numbers, or a bare path object.

*An animated shape path wraps its value in a single-element array.* A static path states the object
directly; a keyframed one nests it one level deeper. The wrapper is the **majority** form — 896
keyframed paths against 627 bare — so reading only the bare form is what crashed most files.

**Not covered — silent, and verified so.** The text and radial-highlight cases were confirmed by importing
each case beside its reduction and diffing the emitted shape command stream; the systematic source trace at
the current source confirms the remaining field-to-consumer gaps below. None is announced, and per the
rule above none should be:

- **Text stroke (`sc`, `sw`) is not read**, and **embedded glyph outlines (`chars`) are not read**.
  `chars` and `fonts` are typed on `LottieDocument` and consumed by nothing. `chars` is how a Bodymovin
  export ships text that renders without the author's font present, so a `chars`-bearing file falls back
  to whatever font the text stack resolves.
- **Radial highlight angle and length (`a`, `h`) are not read.** Both are typed on
  `LottieGradientShapeItem`, but neither reaches the gradient matrix or Flight's focal-point field.
  The mapping needs a format-derived relation before it can be implemented without guessing.
- **Precomposition asset bounds (`w`, `h`) do not clip their layer subtree.** The child timing and layers
  are carried, but turning the asset rectangle into a viewport would require a stated clipping contract.
- **Shape-item names below a group are not retained.** A group name lands on its display container, but
  paths and paints are consolidated into one emitted `Shape`, so there is no one-to-one node for each
  item's `nm`. Expression-only indices (`ix`, shape `ind`) and the group's declared property count (`np`)
  likewise have no visual output.

Multiple fills, strokes, and gradients all survive when the fixture places them after the same local
paths, but the general shape rendering model is **not covered**. The importer currently collects every
local path and paint into one `Shape`, applies every paint to every local path regardless of item index,
isolates nested groups from an outer style, and emits paint passes in file order. The format instead
scopes styles and modifiers to preceding shapes (including subgroup-nested shapes) and renders repeated
styles in reverse order. Shape-style blend mode (`bm`) likewise has no per-style node/effect target in
the consolidated output. Fixing these together requires a scoped render-stack representation, not a
field fallback; single-style groups with their style after their paths are unaffected.

Polystar roundness is built from the relation the format
itself fixes — a polygon at 100% outer roundness is the circumscribed circle — which pins the tangent
handle to `r * (4/3) * tan(t / 4)` scaled linearly by roundness. That is verified by sampling the
emitted curve, and mutation-tested. It has **not** been compared against a real Bodymovin export, so
if Bodymovin's own roundness curve differs (most plausibly for a star's *inner* roundness, where no
circle relation constrains it) this would diverge subtly. A real-asset comparison would settle it.

**Not covered — declared exclusions.** These were scoped out in the blessed charter rather than missed:
expressions (`x`, never executed); text animators and animated text documents; effect layers (`ef`);
audio and camera layers; 3D layers, `position.z`, and skew axis (`sa`); track mattes (`tt`, `td`, `tp`);
shape-style blend mode (`bm`) until styles have scoped display/effect targets; arbitrary time remapping
(`tm`); and the shape modifiers repeater (`rp`),
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
| `lottie.unsupported-expression` | The author attached an expression; baking it before export works. |
| `lottie.unsupported-shape-modifier` | A repeater, merge-paths, rounded-corners, or animated trim/dash. |

The last two sit in the band the diagnostics convention keeps deliberately: the drop is contingent on
an author choice *and* the consumer has a next action. **Whether both earn that keep is an open
ruling** — `unsupported-shape-modifier` in particular reports our own unimplemented modifiers, and
retiring it here would be defensible.

**Blend modes are covered in full**, and the crumb that used to announce them is gone. Bodymovin
numbers overlay 3, darken 4 and lighten 5; this importer read 3 as *Add* and put darken and lighten at
8 and 9, so an overlay layer rendered additive while the two modes Flight expresses cheapest fell
through unmapped. Corrected to Bodymovin's own numbering and split across the two tiers: the
fixed-function five fold into blend state, and the other eleven are reported on `advancedBlends` for
the caller to realize through a `BlendEffect`.

## SVG documents

`createScene2DFromSvgDocument` produces a display subtree from a static SVG document.

**Covered:** the structural elements `svg`, `g`, `a`, `switch` as an all-children container, `symbol`,
`defs`, and `use` (recursion-guarded), with nested viewports and `viewBox` transforms; the geometry
elements `path`, `rect`, `circle`,
`ellipse`, `line`, `polygon`, and `polyline`; `text` with `tspan`, including transparent `fill="none"`,
subtree display/visibility suppression with descendant visibility override, and nested run opacity;
`image` through the injected
`resolveImageResource` seam, with intrinsic dimensions mapped through the image viewport's default
`xMidYMid meet` or explicit `preserveAspectRatio`; linear and radial gradients including
`objectBoundingBox` units and gradient-stop `currentColor`; hex, RGB/RGBA, HSL/HSLA, percentage alpha,
and the importer's bounded named-colour table; simple id/class/tag/tag.class stylesheet selectors;
`clipPath`
as a hard `ClipRegion`; and the non-rendering elements `style`, `title`, `desc`, and `metadata` skipped
by name.

**What the conformance corpus exposed.** Across the 34 documents, 410 source drawables produced 520
`drawPath` records (more than one-to-one, because `use` instantiates). Every shortfall traced to a
declared exclusion — `pattern` fills and soft masks, each already announced by a crumb — except two.

*`inherit` silently deleted geometry.* **Fixed.** `inherit` is the CSS-wide keyword for "the parent's
computed value" and is legal on every presentation attribute. Read as a paint value it resolved to no
fill and no stroke, so the element imported as a shape with an **empty command list** — geometry gone,
no diagnostic. It is now resolved at the one style seam: for an inherited property the declaration is
dropped, since an absent declaration already resolves to the parent's value; the three non-inherited
properties (`display`, `filter`, `opacity`) name the parent explicitly, because dropping the
declaration would reset them to their initial value instead. Six regression tests pin it.

*Internal DTD entities were dropped.* **Fixed, in `@flighthq/xml`.** A document declaring
`<!ENTITY Smile "<circle …/>">` and expanding it with `&Smile;` lost all the expanded content with no
diagnostic: the DOCTYPE was discarded wholesale and only the five predefined entities decoded, so the
reference survived as literal text rather than markup. The fix could not be a larger entity table —
a replacement is *markup*, and entity decoding ran on already-extracted text, too late to produce
elements. It is now a source-level pre-pass: declarations are collected while the DOCTYPE is stripped,
then substituted into the source before the tree is built, so an entity-expanded document imports
identically to the literal spelling. Two forms are deliberately **not** honored — external entities
(`SYSTEM` / `PUBLIC`), which resolve a URL or file path at parse time and would let a document read
whatever the process can reach, and parameter entities. Expansion carries a size-and-pass budget,
because entities that reference each other expand exponentially; the six-level bomb that materializes
ten million characters unbudgeted stays bounded, and a self-referencing declaration terminates.

*Image aspect-ratio mapping was dropped.* **Fixed.** A resolved 20×10 image placed into a 100×100
viewport was independently scaled to 5×10 even though the importer's existing viewport rule defaults
to `xMidYMid meet`. Image placement now reuses that rule: the default maps to scale 5 at `(10, 45)`,
while explicit `preserveAspectRatio="none"` retains scale 5×10 at `(10, 20)`. A focused regression pins
both outcomes.

*Text paint and subtree appearance were dropped.* **Fixed.** `fill="none"` previously became opaque
black at the text-format fallback. Hidden `tspan` text was still appended, `display="none"` descendants
could escape their suppressed subtree, and nested non-inherited opacity did not reach the flattened
text runs. The run collector now retains transparent paint, applies display and visibility with their
different subtree semantics, and multiplies nested `tspan` opacity into range colour alpha while the
root text opacity remains on the node exactly once.

**Systematic silent gaps confirmed in the current source.** These are recorded rather than guessed across
a semantic or runtime boundary:

- Radial-gradient focal coordinates `fx`/`fy` are parsed and inherited but do not reach the gradient
  matrix or a focal-ratio field. The conversion depends on the gradient's coordinate space and transform.
- `switch` does not evaluate `requiredFeatures`, `requiredExtensions`, or `systemLanguage`; it emits every
  child because the importer has no feature/language environment contract.
- Stylesheets deliberately skip descendant/child/sibling/attribute/pseudo selectors. `!important` is
  stripped rather than participating in the cascade, and the named-colour table is only a bounded subset.
  Gradient-stop `stop-color`/`stop-opacity` from a matching stylesheet rule are also not computed.
- Length parsing accepts numeric prefixes but does not resolve percentage, font-relative, or viewport-
  relative units against a property-specific reference box. A viewport without `viewBox` is translated but
  not sized/clipped; `overflow` is not modeled; mask region `x`/`y`/`width`/`height` and `maskUnits` are not
  applied (only `maskContentUnits` affects content geometry).
- Text paint is fill-only and layout is deliberately flattened; text stroke and advanced baseline,
  spacing, direction, and per-glyph positioning fields do not reach `TextFormat`. `vector-effect` and
  `paint-order` are not presentation fields here.
- A rectangle with distinct `rx` and `ry` is lowered through Flight's circular-radius round-rectangle
  helper using the larger radius, so elliptical corners are not preserved. Paint-server fallback tokens
  after `url(...)` are not parsed.

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
`svg.object-bounding-box-clip-unmeasurable-bounds` (raised only when a text descendant leaves the box
unmeasurable — a zero-area target is conformant and silent, since the format ignores the effect).

## Rive (`.riv`)

**Rive imports end to end**, from container bytes to a `Scene2DDocument`. `parseRiveDocument` decodes
the file into its header and flat core-object stream, `createRiveObjectGraph` reconstructs the
artboards and the component tree from it, `createScene2DFromRiveDocument` produces one display subtree
per artboard — shapes, paint, clipping, draw order, solo switching, rich text, and animation
clips that bind geometry and paint as well as transforms — and `createScene2DDocumentFromRiveDocument`
presents the file as a named-graph document with resource references and nested-artboard slots. Each
of those stages has its own section below, with the corpus counts behind it.

The detailed corpus observations in this section were accumulated across earlier 37- and 64-file runs;
their Flight snapshots are `3169afdcf` and `ced9d49c4` respectively. They remain useful historical
evidence, but the upstream corpus revisions were not pinned. Current ranking and animation counts are
only the measurements explicitly tied to the 38-file baseline named above.

**What is not connected is a bounded list, not the bulk of the format**: text modifiers, the parsed
rig/weight data's production bridge to displayed paths, constraints, data binding, Feather, and the
state-machine *runtime*. Static layout descriptors and animation loop mode / work area / playback speed
are read; the state-machine *descriptor* is read. The ranked table near the end of this section carries
the current pinned counts behind the unconnected list.

A `.riv` is not a document tree on the wire. It is a header followed by a flat run of **core
objects**, each a numeric type key and then numeric property keys with their values. Every structure
a reader cares about — artboards, shape hierarchy, animations, state machines — is reconstructed from
that stream by later stages against Rive's object-model definitions.

**Covered:** the `RIVE` fingerprint; varuint (unsigned LEB128) major version, minor version, and file
id; the property table of contents; and the object stream with its four wire field types —
varuint, varuint-length-prefixed UTF-8 bytes, little-endian IEEE-754 binary32, and little-endian
unsigned 32-bit (color). A boolean travels as a single 0/1 byte, byte-identical to a one-byte
varuint, which is why the table needs no code for it.

**The file's table of contents is a supplement, not the source of property widths.** This is the
detail that decides whether a reader works at all on real files, and it is easy to read the format
backwards. A reader needs a built-in table of the widths the object model defines; the file's own
table only adds keys the authoring tool believes a reader may not know. A file using only standard
properties ships an **empty** table — every real file tested does — so a purely table-driven reader
stalls on the first property of the first object. `getRiveCorePropertyFieldType` carries that
built-in table, derived from the 368 object-model definitions the format publishes as data, and it
is consulted **before** the file's table.

That table must include each property's **alternate** keys, not only its current one. A property
may carry retired key numbers, and files in circulation still write them: `Node.x` is key 13 today
and was key 9, and omitting the alternates failed 11 of the first 40 real files tested on that one
key alone.

Two more details are easy to get wrong and are pinned by tests: the table's two-bit field codes pack
**four to a 32-bit word**, using only that word's low byte — reading it as a dense sixteen-per-word
bitmap desynchronizes the whole stream — and varuint values are accumulated arithmetically rather
than with 32-bit shifts, so a value above 2^31 survives.

**Type identity is covered.** `getRiveCoreTypeName` and `isRiveCoreTypeDerivedFrom` carry the 368
object types and the inheritance each declares. Inheritance is the part that matters: behaviour is
inherited — a Rectangle is a Shape is a Node is a Component — so a stage that compares type keys for
equality misses every subclass. The graph is acyclic, at most eight deep, and every declared parent
resolves, which the table's own test re-checks rather than assumes.

Across the 64-file corpus, 190 distinct types appear and all but one resolve. The exception is type
key 526, seen once, which the current published model does not define. An unnamed type is harmless
in a way an unknown property is not: a type key is only a number followed by properties, so the
object still decodes with its properties intact and merely lacks a name.

**Artboard segmentation and the component tree are covered.** `createRiveObjectGraph` splits the flat
stream into artboards and resolves each component's parent. Two facts drive it, both settled against
real files rather than reasoned from the spec: **an artboard opens a numbering space in which it is
index 0**, its components following in stream order, and `parentId` (property key 5) is an index into
that space. Numbering the artboard as 0 resolves every stated parent across 127 real artboards with
no cycle and exactly one root; numbering from the first component instead leaves 94 references out of
range and 33 cycles. Only components are numbered — animations, keyframes, assets and state machines
share the stream but sit outside the addressing, and counting them would shift every later index.

Over the corpus this produces 37,595 components across 127 artboards with no unresolved parent and no
diagnostic, at a maximum tree depth of 17. An unresolvable or self-referencing parent is reported and
the component becomes a root, so one bad reference costs its own placement rather than the artboard.

**Transforms and the display tree are covered.** `createScene2DFromRiveDocument` returns one display
subtree per artboard — a `.riv` holds several and names none of them "the" one, so import presents
them side by side and leaves the choice to the caller. Artboard name, width and height are read, and
the artboard's normalized origin becomes a **pivot** in artboard units, which is Flight's word for
the same idea. Per node: name, x and y (accepting the retired alternate key), rotation, scale, and
opacity onto `alpha`.

**Rive states rotation in radians and `Node2D.rotation` is degrees**, so import converts. That the
source is radians was established from the corpus rather than assumed: 1,299 rotation values with a
maximum of 6.93, clustering on exact 3π/2 and 2π, where degrees would show 90/180/360. The
assertions guarding it are written against `Node2D`'s unit contract, not against the conversion —
the Lottie importer carried the mirror-image bug precisely because its tests took the expected value
from the conversion instead.

Only components that are Nodes become display objects. A Fill or a GradientStop is a component with
an index, but it is paint belonging to the shape above it, so emitting one would put a phantom object
in the tree; a node whose nearest ancestor is such a component attaches past it rather than being
dropped. Properties absent from the stream take the format's documented initial value, so an omitted
scale is 1 rather than 0.

Over the corpus this produces 7,580 display nodes across 127 artboards, at a maximum depth of 13,
with no non-finite rotation and no alpha outside 0–1. One artboard reports a zero size, which the
format permits since width and height default to 0 when unstated.

**Path geometry is covered.** A Rive Shape becomes a Flight `Shape` and each path beneath it
contributes commands to that one shape rather than becoming a node of its own — Rive combines a
shape's paths into a single figure, which is how a hole cuts its parent, so splitting them would
break the compositing the format states. A path carries its own transform, and since it is no longer
a node that transform is baked into the geometry it hands over.

**A path always belongs to a shape**: all 3,776 paths in the corpus are a Shape's direct child, with
no exceptions and no intermediate node. A path found outside a shape is therefore a malformed file
rather than a shape of the format, and it emits `rive.path-outside-shape` rather than disappearing —
unreachable on every file tested, but geometry that vanished silently would leave nothing to notice.

Covered path kinds: `PointsPath` with all four vertex kinds, and the parametric family — rectangle
(linked and per-corner radii), ellipse, triangle, polygon and star, each positioned by its own
normalized origin, which defaults to its centre.

**Cubic handles are polar, and the three cubic kinds disagree on sign.** A vertex states an angle and
a distance rather than an absolute control point. A mirrored or asymmetric vertex *subtracts* its
incoming vector, keeping the pair collinear through the vertex; a detached vertex *adds* its own
separately-angled one. Applying one rule to all three reflects every detached handle through its
vertex and bends the curve the wrong way.

**Straight-vertex corner rounding is covered**, and it is common rather than exotic: 2,533 of 8,454
straight vertices in the corpus state a nonzero radius. The construction is the format's own "natural
rounding" rather than an approximation — the radius is clamped to half the shorter adjoining edge,
the corner is replaced by tangent points that far back along each edge, and the handles are pulled in
from those points by a distance that varies with the corner's angle. At a right angle the expression
collapses to the familiar 0.5523 circle ratio, which is the check that the general form is right. An
open path's endpoints stay sharp, since a corner needs an edge on both sides.

Over the corpus this builds 3,770 path records across 2,409 shapes — 54,378 points and 13,406 cubic
segments, none non-finite. Fifteen shapes produce no geometry, which the format permits for a shape
whose children carry none.

**Not covered:** a **negative** corner radius, which Rive treats as an inverted corner rather than a
convex one. Three of 2,533 radii in the corpus are negative; those corners round outward by the
stated magnitude instead of inverting.

**Paint is covered, as an ordered list.** A shape states a *list* of paints, not one of each kind, and
every paint covers all of that shape's paths — so each paint restates the whole path set in the order
the file lists them, which is what lets a second fill sit above the first instead of replacing it.
This is not a hypothetical: **429 of 2,409 shapes in the corpus carry more than one paint**, and a
one-slot-per-kind model would silently lose paint on every one of them. Lottie needed that same fix
retrofitted; here it was built in from the start.

Covered: solid fills and strokes, linear and radial gradients with their stops, per-paint visibility,
fill rule, and stroke thickness, cap and join. **Rive states colour as ARGB** while Flight takes a
packed RGB with a separate alpha, so every colour is unpacked at the seam; a gradient stop's alpha is
scaled by the gradient's own opacity, and its position converts from Rive's 0–1 fraction to Flight's
0–255 ratio. A paint's colour or gradient lives in a *child* of the paint rather than on the paint
itself.

Over the corpus, 2,372 of 2,409 shapes receive paint — 1,849 solid fills, 706 strokes and 458
gradients — with no alpha or stop ratio out of range. The 37 unpainted shapes state no visible paint.

**Blend modes are covered in full, across Flight's two tiers.** `BlendMode` is deliberately the
fixed-function set that folds into blend state — normal, screen, darken, lighten, multiply here — and
the destination-reading and non-separable modes are `AdvancedBlendMode`, realized through a
`BlendEffect` that bounces through an offscreen and samples the backdrop. Both tiers already exist;
see [effect / adjustment / material architecture](effect-adjustment-architecture.md), which calls the
advanced set "the canonical composite effect".

So import splits them: fixed-function modes land on `Node2D.blendMode`, and the other eleven are
reported on the artboard's `advancedBlends` for the caller to apply. **Import attaches no effect** —
`displayObject.filters` is an anti-goal, and an effect is an explicit descriptor the caller invokes.
Assigning an advanced mode to `node.blendMode` and getting a silent Normal is the exact bug that tier
split exists to prevent, and it is what this importer originally did. In the corpus 2,898 of 3,042
drawables use the default; of the 144 that do not, 93 are advanced modes that now reach a caller
instead of vanishing.

**Clipping is covered, and the coordinate transfer is the substance of it.** A clipping shape names a
*source* shape elsewhere in the artboard, whose geometry sits in the source's own transform chain,
while Flight rasterizes a clip under the **clipped** node's transform. The geometry therefore has to
cross chains: `inverse(clippedRelative) · sourceRelative` applied to the source's points. Both chains
are measured from the artboard root, whose transform is common to the two and so cancels — which is
what keeps the artboard's own pivot out of the arithmetic. A component that holds no transform passes
its parent's through rather than restarting at the identity.

Over the corpus this clips 229 nodes with no non-finite bounds and no empty contour set. Rive
intersects several clips on one node where Flight carries a single region, so a second clipping shape
on the same node emits `rive.multiple-clipping-shapes` (8 in the corpus) rather than quietly
replacing the first — intersecting contour sets is a `@flighthq/path-boolean` job, not something to
fake. A source that resolves to no geometry emits `rive.unresolved-clipping-source` (14).

**Transform animation is covered.** Each artboard returns its linear animations as named clips.
Animations are **not components** — they follow their artboard in the stream but sit outside the
artboard's numbering — so they are read from the raw object stream through the span the graph
records, while their `objectId` references point back into the component numbering.

Time is `frame / fps` using **the animation's own frame rate**, since each states its own rather than
inheriting the document's. Rotation converts radians to degrees, as everywhere else.

The interpolation enum was settled from the corpus rather than a header: type 2 carries an
interpolator in 18,044 of 18,608 cases, type 1 never does, and type 0 almost never — hold, linear,
cubic. Cubic segments use the eased curve their named interpolator states.

**Loop mode, playback speed and the work area are read, and reported rather than applied.** Each
`RiveAnimationClip` carries `loop` (`OneShot`/`Loop`/`PingPong`), `speed` where 1 is authored speed,
and `workAreaStart`/`workAreaEnd` in seconds — null unless the animation sets `enableWorkArea`, since
the bounds' unset sentinel is −1 and 0 is a real frame. An `AnimationClip` is channels sampled at a
time, with no notion of repetition, rate, or a trimmed range, so applying these would bake a playback
policy into sampled data; the caller driving the playhead is the one that can honor them. The work
area trims *playback*, not content, which is the other reason import reports the span rather than
dropping the keyframes outside it.

**Elastic interpolation is covered, and the earlier framing of this gap was pointing at the wrong
thing.** It was recorded as "kinds 3 and 4 have no Flight equivalent". In fact Rive's runtime never
switches on `interpolationType` at all: `InterpolatingKeyFrame::onAddedDirty` resolves
`interpolatorId` and uses whatever `KeyFrameInterpolator` it lands on, so the *object* carries the
behaviour and the enum is only a hint. `KeyFrameInterpolator` (type 175) has exactly three concrete
subclasses — `CubicInterpolator` (139), `ElasticInterpolator` (174) and `ScriptedInterpolator` (972) —
and this importer collected only descendants of 139. An elastic interpolator therefore resolved to
nothing and its segment fell back to linear. It was a **collection gap, not an unknown kind**, which
is why the 42 cases went unexplained for so long.

`ElasticInterpolator` states `easingValue` (405, in/out/in-out with **out** as its initial value),
`amplitude` (406) and `period` (407), and now maps onto `@flighthq/easing`'s parameterized
`easeInDampedSine` / `easeOutDampedSine` / `easeInOutDampedSine`. The fixed `easeInElastic` family
could not serve it: those hardcode period 0.4 and unit amplitude, so substituting them would be
confidently wrong on any file stating anything else rather than approximately right. Amplitude below
1 changes the curve's shape rather than only its scale — the amplitude ramps in over the first
quarter-wavelength so the curve still reaches its endpoint — and that is the format's own
construction, reproduced rather than approximated.

**Elastic curves diverge from Rive in their degenerate cases, deliberately, and this is the statement
of that limit.** Flight's `easeInDampedSine` / `easeOutDampedSine` / `easeInOutDampedSine` implement the
published parameterized elastic — phase `asin(1 / amplitude)` over the wavelength — so an ordinary
amplitude and period produce the same curve anyone implementing that mathematics would get. The two
degenerate cases are **Flight's own choices and differ from other implementations**: an amplitude below
1, where the phase term has no real solution, is raised to 1 rather than reshaped; and a non-positive
period falls back to 0.4, the constant `easeOutElastic` already uses, so the parameterized and fixed
families agree with each other. A file authoring either degenerate case will therefore not match its
source pixel for pixel. That is a known and accepted fidelity limit rather than a defect: a stated
divergence is fine where an unstated one would not be.

**`ScriptedInterpolator` is deliberately not covered and is not a gap to reopen.** It runs Rive's own
scripting language, which a codec does not execute. Its segments fall back to linear.

**`interpolatorId` and `parentId` do not share a numbering space**, which is worth knowing before
adding another id-valued property. `parentId` indexes components only — resolving it against all
artboard objects lands on `SolidColor` and `GradientStop`, which cannot be parents. `interpolatorId`
is the opposite: against all artboard objects it resolves to a real interpolator in 17,910 of 18,044
cases, and against components only in **zero**. Each id's space has to be established rather than
assumed from a sibling.

At the current pinned baseline, 359 clips carry 8,333 keyed-property tracks.

**Numeric geometry and paint animate too, through the property the file keyed.** Transform properties
bind to `Node2DAnimationTarget`; vertex positions, corner radii, colours, stroke widths, parametric
sizes and trim spans write their samples back onto the core object the file keyed and queue the owning
shape to rebuild. Because every reader in this codec reads from those same properties, one binder
serves all of them and there is no second geometry/paint path to keep in step. Rebuilds coalesce per
sample, so a shape with several animated properties regenerates once after every channel has landed.
Playback stays explicit through `applyAnimationClipToRiveDocument`.

The keyframe's own type determines how it samples: `KeyFrameDouble` states its value at key 70, while
`KeyFrameColor` states packed ARGB at key 88 and interpolates four byte channels rather than the packed
integer. A composition matrix drives every shared Rive path — x, y, rotation, scale x/y and opacity —
beside mutable vertex and colour channels in the same clip and verifies the final transform, geometry
and paint. The other keyframe subclasses (bool, id, string and uint) are deliberately not read through
the double field; their value fields and useful drawable targets remain an adjacent corpus audit.

At the current pinned baseline the importer emits 7,617 channels, leaving 85 of 359 clips empty and
716 keyed-property tracks without a channel. The non-double subclasses account for 123 of those:
50 `KeyFrameId`, 34 `KeyFrameUint`, 13 `KeyFrameString`, 8 `KeyFrameBool`, and 18
`KeyFrameCallback`. The remainder are mostly double or colour tracks aimed at systems outside the
static geometry/paint binder — constraints, layout refresh, text modifiers, data binding, and Feather
— so widening the value reader alone would not connect them.

**The 85 clips still carrying no channels** are a mixed population rather than one generic binder gap.
Some target visible local data; others target constraint, layout, event, audio, script, data-binding,
text-modifier, or Feather runtimes. The 716 unbound-track count above ranks further audit, not a scalar
fallback.

**Trim paths are covered**, and they belong to a **stroke** rather than to a shape — all 46 in the
corpus are a stroke's child, so a trim narrows only the stroke that owns it and leaves that shape's
fills alone. Start, end and offset are fractions of length, established from their corpus ranges
rather than assumed: offset runs −0.25 to 0.422, which no degree-valued field would.

The two modes differ in what the fractions measure, and they keep the same total length, so only the
distribution separates them. **Synchronized** measures each path against its own length, taking the
same proportion out of every one. **Sequential** measures against the paths' total as one continuous
run, so the span is consumed in order and later paths may be left out entirely. Sequential is the
common case, 36 of 46. A span that runs off the end **wraps** to the front, which is how a trim
animates continuously around a closed shape, and it emits the two pieces rather than clipping.

**Draw-order overrides are imported**, through `@flighthq/node`'s `NodeOrderList`. `DrawRules` and
`DrawTarget` move a drawable to sit immediately before or after another drawable. A `DrawRules` is
parented to the node it governs and names a `DrawTarget`, which names the drawable and the
before/after side — the exact shape of `setNodeOrderListEntryBelow` / `Above`, so a rule needs no
interpretation beyond resolving its two ids.

Ordering permutes children **within one parent**, so a rule whose governed node and target drawable
are not siblings would need reparenting, moving the node out of the group whose alpha, blend, and clip
it composites under. Those are reported as fidelity loss (`rive.draw-rule-crosses-parent`) rather than
approximated. Across the 41-file reference corpus, of **61 rules: 33 are honored, 13 cross a parent
boundary, and 15 name an end that is not a display node** (`rive.draw-rule-unresolved`).

An earlier revision of this document put the cross-parent share far higher, at 83 of 96. That figure
was measured in the wrong space — it compared **component-tree** parents, while ordering operates on
the **display tree**, and the two disagree: a component whose parent is not itself a display node
reparents up to the nearest one, so components that are not component-siblings frequently *are*
display-siblings. Measured through the real import path, the honorable case is the majority. The
correction is recorded rather than quietly swapped, because the discarded number was used to argue
that the ordering model could not serve Rive.

**Solo variant switching is covered.** A `Solo` is a Node that shows exactly one of its children at a
time — the switcher behind a character's alternate limbs or a button's states. Imported as a plain
node it drew *every* variant at once, stacked, so this was a visible wrongness rather than a missing
feature and is applied rather than reported. The active child is named by a component index (property
296), verified against every Solo in the corpus: all 9 resolve to a component whose parent is the Solo
itself. Applying it hides 61 stacked variants across the corpus.

**Static Rive layout descriptors are imported.** Each artboard now exposes `layouts`, one entry per
independent authored layout root. An entry pairs a parent-before-child `LayoutTree` with display
`targets` index-for-index. The importer deliberately supplies neither intrinsic sizes nor resolved
rectangles: the caller measures those targets into `@flighthq/layout`'s two-number-per-node intrinsic
buffer, owns the output buffer, and chooses how a rectangle binds back onto a display node.

The translation keeps the two roles Rive itself keeps separate. A `LayoutComponent`'s style is its
`containerStyle`, while the same component's sizing is the `itemStyle` interpreted by its parent. A
`LayoutParticipant` attaches sizing to its host Shape/Text/Image/Node instead of creating a phantom
target. Ordinary `Node` groups remain transparent to layout, `Solo` contributes only its active
branch, and a styled component below an opaque non-layout ancestor becomes another independent root.

For flex, direction including RTL, reversal, 12-way alignment, wrap, point gap, point padding/border
insets, fixed main-axis basis, fill fractions, and cross-axis fill/stretch map to
`FlexLayoutContainerStyle` / `FlexLayoutItemStyle`; hug continues through caller-supplied intrinsic
sizes. Current Rive grid and stack data also maps onto Flight grid: explicit point/fraction/auto
template tracks, row/column gaps, one-based placement and spans, and stack's overlapping 1×1 cell.

At Rive revision `8efe18ec7b52a02139844ffe71438c00de13037e`, the `RIVE_*` constants record the
format's published interface facts. Its JSON definitions — `dev/defs/layout_component.json`,
`dev/defs/nested_artboard_layout.json`, and the definitions under `dev/defs/layout/` — together with
the published `include/rive/layout/layout_enums.hpp` enums declare the property keys, defaults,
runtime flags, enum values, component-index `styleId`, and separate container/item roles. The solvers
in `@flighthq/layout` are independent Flight implementations of CSS Flexbox and Grid, written before
this importer.

The unsupported Yoga/Rive behavior is explicit project coverage, not a diagnostic emitted for every
ordinary Rive file:

- item margins, absolute positioning and edge offsets have no Flight flex item fields;
- percentage lengths, min/max dimensions, aspect ratio, `display:none`, overflow, and intrinsic
  container sizing have no equivalent in the current descriptor vocabulary; only point-valued
  gap/padding/border and fixed main-axis size are retained, while fixed cross-axis size still depends
  on the intrinsic measurement the caller supplies;
- Flight flex has one gap and no separate wrapped-line `align-content`, so a Rive wrapped layout can
  lose its distinct main/cross gaps and cross-axis line packing;
- grid minmax/percent tracks, authored auto-track lists, implicit-track growth, single-axis or
  out-of-range placement, `justifyItems` / `justifySelf`, and grid/stack cell hug/alignment are not
  represented; stack retains overlap but not its nine-way cell alignment;
- layout animation, interpolation, and data-binding changes are snapshots at import time; they do not
  mutate or re-resolve the returned descriptor, and rectangle-to-node binding/clipping remains a
  caller concern.

The retired editor round-trip keys are deliberately *not* counted as gaps. Canonical definitions mark
`flex` (520), `flexGrow` (521), `flexShrink` (522), `alignSelfValue` (602), `edgeConstraints` (545),
`alignContentValue` (600), `alignItemsValue` (601), and `justifyContentValue` (603) `runtime:false` and
the Rive engines do not read them; current fill weight and alignment derive from scale/fraction fields
and `layoutAlignmentType` instead.

**What the current pinned corpus says is still unconnected**, measured at Flight `a3707655f` against
rive-flutter `fc9fd0445a205092ad340491d48ec16f42d2562e`. These counts rank prevalence; they do not
choose among runtime and architecture questions.

| gap | objects | files | note |
| --- | --- | --- | --- |
| Rigging / skinning (`Weight`, `Tendon`, `CubicWeight`, `Skin`, `RootBone`, `Bone`) | 3,031 | 22/38 | Bones, bone animation, and weights parse; weighted paths never enter the production import path |
| Constraints (`*Constraint`) | 191 | 12/38 | Solvers; where they live is a charter question |
| Data binding (`ViewModel*`, `DataBind*`, `BindableProperty*`, `DataConverter*`, `FormulaToken*`) | 2,444 | 9/38 | A runtime binding system, not static document data |
| Text modifiers | 22 | 4/38 | Modifier groups and ranges do not reach rich-text output |
| Feather | 150 | 3/38 | Belongs to the effects tier |
| Mesh / vertex art | 291 | 1/38 | Travels with the unresolved rig-to-display bridge |

**The refreshable reference corpus is 38 files, not 42 paths.** Four `*.riv` paths do not begin with
the `RIVE` fingerprint and are pointer text rather than Rive bytes. The exact checkout and manifest
hash are recorded in the verification section above; future comparisons must name both.

**Assets are covered as data, with no acquisition.** Every asset the file declares is returned in
declaration order — image, font, audio, script and manifest — with its name, kind, stated dimensions
and cdn base url. **Order is how they are addressed**: an image drawable's `assetId` is a position in
that list, not the id the asset states. That was settled against the corpus, where reading it as a
position resolves all 61 image references and reading it as the stated id resolves none.

An embedded payload travels **untouched**. That needed a container fix: text and blobs share one wire
code, because the table of contents has two bits per property and its job is to say how many bytes to
skip, not what they mean. Which a property actually is comes from the object model, and the reader
now keeps blob-typed properties whole instead of decoding them as UTF-8, which would corrupt an
image.

Over the corpus this yields 103 assets, 89 carrying 15.1 MB of embedded payload, and **every payload
matches a valid magic number for its kind** — 20 PNG, 25 WebP, 1 JPEG, 23 TrueType, 8 FLAC, 4 WAV, 1
MP3, plus Rive's own script and manifest formats. Nothing is corrupted in transit.

Turning a payload into an image or a font is a resource-layer concern, so this codec acquires
nothing: the bytes and the metadata are handed over and a caller decodes what it wants, matching the
`resolveImageResource` seam the SVG and Lottie importers use.

**State machines are described as data, and nothing is interpreted.** The charter puts Rive's
state-machine *runtime* — inputs driving transitions — in a separate cell, so this reports the
machine and drives none of it: named machines, their inputs by kind and value, layers, states, and
the transitions leaving each state with their duration, exit time and flags.

Transition and animation references keep the values the file states rather than being resolved into
positions. Rive uses at least three distinct id spaces — a component's parent indexes components, an
interpolator indexes all artboard objects, an asset indexes the asset list — so a descriptor that
guessed at a fourth would be worse than one that reports what is written.

Over the corpus this yields 98 machines, all named, across 154 layers holding 789 states and 404
transitions, with 70 inputs. **A machine takes its name from the `Animation` it extends, not from the
state-machine component key its layers and inputs use** — reading it with the layer's key leaves every
machine in the corpus unnamed, which is how the mistake showed itself.

**Text is covered, including runs that differ in style.** A text drawable's words live in its **value
runs**, each naming a style, and a style paints itself through a fill child exactly as a shape does.
Runs are joined in file order and **each run contributes one `TextFormatRange`** over the span it
occupies in the joined string, so a drawable whose runs differ in size, colour or typeface keeps that
difference — 28 of 117 texts in the corpus have more than one run. A run is the unit the file
authored, so every run states a range rather than only the ones where the style changes. The first
run's style also becomes the drawable's own format, which is what a consumer laying out from the
format alone reads. The drawable's box and alignment carry over, with alignment numbered left, right,
centre.

**A text drawable always imports as a `RichText`, never a `TextLabel`**, even when a single run makes
the ranges redundant with the format. `TextFormatRange` lives only on `RichTextData`, so keying the
node kind on run count would make it depend on the *contents* of the file: a caller that registered a
renderer for `TextLabel` would silently lose every multi-run text. One Rive concept maps to one Flight
kind. This follows the SWF importer, which imports `DefineEditText` fields as `RichText` for the same
reason.

`styleId` indexes the artboard's **component numbering**, the same space `parentId` uses — against the
corpus it resolves all 150 runs, while resolving it against the styles in declaration order resolves
4. That is the fourth distinct id space in this format.

Over the corpus this produces 117 labels, 113 carrying text and 112 carrying a size, with real
strings recovered from real files.

**The typeface a style names is covered as a name, not as glyphs.** `fontAssetId` (property key 279)
is a position in the asset list, the same space an image drawable's `assetId` indexes, and it resolves
to that asset's name on `TextFormat.font`. An unset reference is −1 rather than 0, which would
otherwise name the file's first asset. The font's *bytes* stay unacquired, exactly as image bytes do:
naming the typeface is this codec's job and decoding it is the resource layer's, which is how SWF
resolves a font id to a family name as well.

Rive's object model also carries a `familyName` on the style (key 341), and it is **not** a shortcut
around this: it is marked `runtime: false`, so the editor never writes it to a `.riv`. The asset's own
name is the only name a runtime file carries.

**Variable-font axes are covered.** A `TextStyleAxis` is a child component of the style, and Rive
packs the OpenType tag into a uint rather than stating it as text, so import unpacks it back into the
four characters a shaper matches on — `wght` is `0x77676874`, most-significant byte first. Each axis
becomes a `FontVariation` on the format's `variations`, the same shape `TextShaperOptions.variations`
already takes, so a shaper reads them with no conversion at the seam. Absent `variations` means the
font's own defaults stand, which is not the same as an empty list. 120 axis objects across 7 of 37
corpus files.

**Not covered:** text modifiers and their ranges — the mechanism behind Rive's animated per-character
effects — text-follow-path, OpenType features, and `TextInput`.

**Rigging does not fit the attachment model the charter assumed, and that is the finding.** The
charter routes Rive's "deformable meshes + bones/skinning" to `@flighthq/skeleton2d`'s
`MeshAttachment2D`, and instructed that `skeleton2d` be checked against what Rive actually states
before mapping. It does not match, for two reasons.

**Rive skins vector paths, not textured meshes.** Of 263 skins in the corpus, **251 hang off a
`PointsPath` and 12 off a `Mesh`**; of 1,738 weights, **1,486 sit on path vertices** — straight,
cubic-mirrored, cubic-detached, cubic-asymmetric — against 252 on mesh vertices. Only 2 of 64 files
contain a mesh at all, while 22 contain bones. `MeshAttachment2D` models a Spine mesh: a triangle
index buffer plus per-vertex UVs. Both are meaningless for a weighted bezier path, so mapping the
dominant case onto it would mean inventing triangles and texture coordinates the file never states.

**The bone models differ in kind too.** Rive's bones are `TransformComponent`s living in the
artboard's own component tree, siblings of `Node` rather than nodes themselves, so they carry a
transform without being drawable. `Skeleton2D` deliberately owns a flat, decoupled bone array and
propagates its own world transforms rather than reading posed nodes — the Spine/DragonBones model,
which is a different architecture rather than a different spelling.

What Flight lacks is a **weighted vector path**: a path whose vertices are driven by bone influences.
Inventing a lossy mesh approximation would produce geometry that looks plausible and is wrong, so
bones, skins, tendons and weights are read past for now, and `Mesh`/`MeshVertex` with them.

**Where that lands has since been ruled, and it is `skeleton2d`, not `path`.** The third member of the
`Attachment2D` family, beside `RegionAttachment2D` and `MeshAttachment2D`, is `PathAttachment2D`, with
one new deformer — `deformSkeleton2DPathAttachment(out, attachment, skeleton, boneIndex)`. `Skin2D`
needs no change: it is already geometry-agnostic, carrying influence counts and
`(boneIndex, localX, localY, weight)` tuples with no triangles and no UVs anywhere in it, so the
weighting math is identical for a bezier vertex. Skinning stays in one package and accommodates Spine,
DragonBones and Rive together rather than growing a second rig runtime.

**The bone rig itself is now flattened.** `createRiveSkeleton2D` turns an artboard's in-tree bones
into a `Skeleton2D` — a flat, parent-before-child array — and returns a component-index → bone-index
map so an animation channel can reach the bone it drives. The reordering is a **topological sort by
tree depth**, well-founded rather than a graph problem: every stated parent resolves and the tree
holds no cycle, so depth order already puts a parent ahead of its children. It returns `null` for an
artboard with no bones, which is most of them.

Two facts decide whether the flatten is right, and both come from the format rather than the corpus.
**A non-root bone states no position of its own**: `Bone::x()` returns the *parent's* `length` and
`y()` returns 0, so a child bone sits at its parent's tip; only `RootBone` states x/y, at keys 90/91,
which are **not** the `Node` x/y keys 13/14. A reader that looked for 13/14 on a bone would find
nothing and collapse the whole chain onto the root. And bone rotation is radians here, degrees on
`Bone2D`, as everywhere else in this codec.

**Every bone property Rive keys now binds, through the per-axis paths.** Rive states one scalar per
property — x, y, rotation, scaleX and scaleY each their own channel with independently authored keyframe
times — and `Skeleton2DAnimationPath` carries `TranslationX`/`TranslationY` and `ScaleX`/`ScaleY`, so
each maps straight across with no axis paired to another. Pairing was never possible without resampling
onto a merged time set and inventing keyframe times the file never stated; the per-axis vocabulary
removes the need rather than working around it. Bones carry no shear in this format.

**Rive states absolutes and the binder composes, so the conversion differs per path.**
`applyAnimationClipToSkeleton2D` ADDS for translation and rotation and MULTIPLIES for scale, so the
inverse is a subtraction or a division, applied once at build time rather than per sample. Rotation
converts radians to degrees before the subtraction, as everywhere else in this codec.

**One case the relative model cannot express, and it is reported rather than approximated.** A setup
scale of zero multiplies every factor back to zero, so no channel can reproduce a non-zero authored
scale. That channel is dropped and emits `rive.unrepresentable-bone-scale`; emitting one would be
silently wrong, and the limit belongs to a relative pose model rather than to the per-axis vocabulary.

That a bone channel bound to nothing at all before this is the mechanism behind the corpus clips that
imported carrying no channels: a bone is a `TransformComponent` and never becomes a display object, so
the display-object path skipped it and there was nothing else to catch it.

**The weights are read too, and four facts about them decide correctness.** `createRiveSkin2D` turns a
skinned path's `Weight`/`CubicWeight` records into a `Skin2D`.

*Influences are packed four to a word.* `values` (102) and `indices` (103) are each a single uint
holding four bytes, read **low byte first** — a 0–255 weight and a bone reference. A zero weight is an
unused slot, which is how a fixed-width record yields `Skin2D`'s variable influence counts.

*An index names a **tendon**, not a bone, and numbering starts at 1.* The runtime's bone table reserves
slot 0 for the identity, so tendon *n* sits at index *n+1* and the tendon then names the bone. Reading
the stored index as a bone index would silently address the wrong bone in every file with more than
one. An influence that does name slot 0 cannot be expressed as a bone at all, so it emits
`rive.unresolved-weight-bone` rather than vanishing — dropping it quietly would leave the vertex
under-weighted and simply in the wrong place.

*The offsets bake the bind.* Rive deforms as `Σ wᵢ · (boneWorldᵢ · tendonInverseBindᵢ) · (skinWorld · p)`,
blending matrices and transforming once, while `Skin2D` stores per-influence offsets already in bone
space and blends positions. Those are the same arithmetic, so the stored offset is
`tendonInverseBindᵢ · (skinWorld · p)`. A tendon states its **bind** (96–101) which is inverted here,
and the skin states its own transform (104–109) separately; Rive states both explicitly rather than
deriving them from the setup pose. Both matrices are read **by name** — the key order is xx, yx, xy, yy,
which is not the column order.

*A cubic handle carries its own influences.* `CubicWeight` extends `Weight` and adds
`inValues`/`inIndices` (110/111) and `outValues`/`outIndices` (112/113), so a cubic vertex holds three
independently weighted positions. A handle is therefore neither skipped nor bound to its anchor's
influences, and any addressing that names only vertices loses authored data on every cubic vertex in a
rigged file. A plain `Weight` asked for a handle pair yields nothing rather than reusing the anchor's,
since inheriting would invent influences the file never stated.

The positions themselves come from the path reader rather than from here: a cubic handle is stated in
polar form and the three cubic kinds disagree on sign, so deriving them a second time would be a
second place to get that wrong. The skin reader takes resolved coordinates and contributes only the
weighting.

**Rive is not boneless, and reading it that way leads straight to designing a free-form deformer.**
It has a full bone system — `Bone`, `RootBone`, `Tendon`, `Skin`, `Weight`, `CubicWeight` — and its
skinning is bone-driven exactly as Spine's is. Only two things differ: *what* is skinned (a vector
path rather than a textured mesh) and *where* the bones live (`TransformComponent`s in the artboard
tree rather than `Skeleton2D`'s flat parent-before-child array). On the import side the second is a
**topological sort**, not a graph problem: the artboard tree already resolves all 37,595 parents with
no cycle at a maximum depth of 17, so the flatten is well-founded, and bone channels then bind through
the existing `Skeleton2DAnimationTarget`.

**A `.riv` imports as a named-graph document, and resources resolve through the shared seam.**
`createScene2DDocumentFromRiveDocument` produces the pieces `Scene2DDocument` wants, and
`registerRiveScene2DDocumentImporter` puts it in the registry beside SVG and Lottie, matching on the
`RIVE` fingerprint. Because a file names no artboard "the" one, the root is a container of all of
them rather than an arbitrary pick.

**Image assets become resource references, not acquired pixels.** An embedded payload is handed over
untouched with its type detected from its own magic bytes, and every texture waiting on it is listed
on the reference — so resolving one binds the decoded image into every sprite at once, and an asset
placed many times decodes once. Import performs no decode and no I/O; that is
`resolveScene2DResources`' job. Over the corpus: 64 documents, 46 image references (25 WebP, 20 PNG,
1 JPEG) with 53 textures wired and **no reference left without one**.

**Nested artboards become slots.** A nested artboard is a named place the document does not fill
itself, which is what a slot is; the artboard it references supplies the `linkage`, so a resolver can
dispatch on the authored symbol rather than matching a display name. 19 slots across the corpus.

The artboards' clips, state machines and advanced blends travel alongside the document rather than
inside it, since `Scene2DDocument` models a static named graph and a caller that wants to play or
blend needs the import itself.

**Also not covered**, beyond the families the ranked table above counts: text modifiers, per the text
section. Scripted interpolation, which runs Rive's own scripting language and is a scope boundary
rather than a gap. Non-double and non-colour keyframe value kinds. Live animated or bound
layout-descriptor refresh. Dashes, which no corpus file uses. Deformable meshes, bones and skinning.
And `Feather`, a paint effect whose home is the effects tier rather than this codec — the table counts
62 objects across 2 files, while an earlier revision of this paragraph said 154 instances; the two have
not been reconciled against the corpus. The state-machine runtime is intentionally a separate future
cell rather than a codec gap.

Import stops deliberately short in two further places, and neither is a gap in this codec. **Image
assets resolve rather than decode**: a reference arrives with its bytes and every waiting texture
wired, and the decode is `resolveScene2DResources`' job, matching the seam SVG and Lottie use.
**The state-machine descriptor is read but nothing drives it**: per the charter the state-machine
*runtime* is a separate future cell and never a codec concern.

**Crumbs.** Fourteen, all asset facts, in three severities.

**Four are `Reject`**, because each ends the parse: `rive.invalid-header` (missing or wrong
fingerprint, or a header that ends early), `rive.truncated-object-stream`,
`rive.unknown-property-width` — a property key declared neither by this reader nor by the file's own
table, after which the next key's position is unknowable — and `rive.unsupported-version`, below.
`rive.unknown-property-width` is the format's own unrecoverable case, not a Flight limitation.

**Eight are `Drop`**, where a piece of the document is lost but the rest imports:
`rive.component-without-parent`, `rive.parent-cycle` and `rive.unresolved-parent` from the graph
stage; `rive.multiple-clipping-shapes` and `rive.unresolved-clipping-source` from clipping;
`rive.path-outside-shape`; `rive.draw-rule-crosses-parent`; and `rive.unrepresentable-bone-scale`, for
a scale channel on a bone whose setup scale is zero, where no factor multiplies zero into a non-zero
authored scale, so the channel is dropped rather than emitted wrong.

**Two are `Skip`**, where an override is not applied and the default stands:
`rive.draw-rule-unresolved` and `rive.solo-unresolved-active`.

A file from another format generation is **refused** rather than misread: the property numbering
differs between generations, so a wrong-generation parse would produce a confident, wrong document
instead of failing. Only major version 7 has been read, and anything else emits
`rive.unsupported-version`.

**Verification status.** At Flight `a3707655f`, the container grammar imports all 38 fingerprint-valid
files from rive-flutter `fc9fd0445a205092ad340491d48ec16f42d2562e` into 108 artboards. The sorted
42-path manifest SHA-256 is
`5625f3d481aa22ad9f0c736725ac021e901853136fe2fd9e8f31db2cdf30b31e`, and no corpus byte is committed.
The older 64-file Android run recorded at Flight `ced9d49c4` decoded 82,543 core objects with no unread
byte or unknown property, but its upstream revision and manifest were not recorded; it is historical
evidence, not the refreshable baseline.

That corpus earned its keep immediately. Against synthetic fixtures alone the decoder passed 30
tests while being unable to read a single real file, because it treated the file's table of contents
as the source of property widths — the exact "synthetic test that encodes the same guess as the
parser" failure. Real bytes exposed it at once, then exposed the alternate-key gap behind it.

Alongside the corpus, the primitives are checked against definitions outside this codebase (LEB128
against its arithmetic definition; float and integer reads against IEEE-754 and little-endian byte
patterns), cursor discipline is checked structurally, and every wire fact is mutation-tested.

**What remains unverified:** only current-generation files were tested, all major version 7. The
reader gates on the major version and refuses anything else (`rive.unsupported-version`), so a pre-7
or future file fails loudly rather than being misread — but no such file has been tried, so the
refusal itself is checked only against synthetic bytes. The minor version is read and not acted on,
which is what the format intends: a minor bump is meant to stay readable.
