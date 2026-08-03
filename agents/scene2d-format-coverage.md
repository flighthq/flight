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

**Lottie and SVG have never seen a real asset.** Both were built and gated entirely against
hand-authored fixtures — no Bodymovin export and no designer-tool `.svg` has been run through either
parser. Everything claimed for them below is "correct against our own fixtures," which is a weaker
claim than the 3D document makes.

**Rive is verified against 64 real editor-authored files**, fetched from Rive's own Android runtime
test assets. They are MIT-licensed, which permits redistribution but requires carrying the copyright
notice, so whether they may live in this repo as committed fixtures is an open licensing decision;
until it is made they are fetched on demand and the corpus runs are reproducible rather than standing
in CI. That corpus has repeatedly caught what fixtures could not — see the Rive section.

**No codec has a functional render scene**, so nothing under `functional/scenes` verifies any of the
three at the pixel level on any backend. That is the largest remaining gap for the cell.

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

## Rive (`.riv`)

**Container layer only.** `parseRiveDocument` decodes the file into its header and flat core-object
stream; no interpretation is built on top of it yet, so nothing produces display nodes, shapes,
animations, or a `Scene2DDocument` from a `.riv` today.

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

**Blend modes convert as far as Flight reaches.** A drawable's blend mode maps onto `Node2D.blendMode`
for the modes both carry — normal, screen, darken, lighten and multiply — and anything else
normalises. This is a **Flight gap rather than a file problem**: Rive states sixteen modes and
Flight's `BlendMode` carries six, so overlay, soft-light, colour-dodge, colour-burn, hard-light,
difference, exclusion, hue, saturation, colour and luminosity have nowhere to land. It is recorded
here rather than crumbed, because its cause is our own enum. In the corpus 2,898 of 3,042 drawables
use the default, and of the 144 that do not, 93 are modes Flight cannot express — so this is the
larger half of non-default blend usage. Widening `@flighthq/BlendMode` is a cross-package question,
and the same one hangs over the `lottie.unsupported-blend-mode` crumb that Lottie still emits.

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
cubic. Cubic segments use the eased curve their named interpolator states; the advanced kinds (3 and
4, 42 cases) have no Flight equivalent and fall back to linear.

**`interpolatorId` and `parentId` do not share a numbering space**, which is worth knowing before
adding another id-valued property. `parentId` indexes components only — resolving it against all
artboard objects lands on `SolidColor` and `GradientStop`, which cannot be parents. `interpolatorId`
is the opposite: against all artboard objects it resolves to a real interpolator in 17,910 of 18,044
cases, and against components only in **zero**. Each id's space has to be established rather than
assumed from a sibling.

Over the corpus this builds 383 clips, all named, carrying 2,925 channels and 11,333 keyframes with
no non-finite time or value.

**Only transform properties bind.** X, Y, rotation, scale and opacity reach `Node2DAnimationTarget`;
animated vertex positions, colours and paint properties would need a format-owned mutable-content
binder like the one Lottie has, so they are read past. That is why **145 of the 383 clips carry no
channels** — they animate only geometry or paint.

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

**Draw-order overrides are a structural mismatch, not a missing read.** `DrawRules` and `DrawTarget`
(96 of each) move a drawable to sit immediately before or after another drawable in the artboard's
**flat** draw list, and that target commonly lives in a different subtree — **83 of the 96 cross a
parent boundary**, with only 6 staying among siblings. Flight expresses z-order as child order within
a parent, so honouring a cross-subtree move would mean reparenting the node, which changes its
transform. Reading the properties is trivial; the mismatch is what blocks it. A Flight-level answer —
an explicit draw index on `Node2D`, or a flattened render list — is a cross-package design question
rather than something this codec can settle.

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

**Text is covered as a single-format label.** A text drawable's words live in its **value runs**,
each naming a style, and a style paints itself through a fill child exactly as a shape does. Runs are
joined in file order; the first run's style sets size, line height, letter spacing and colour; the
drawable's own box and alignment carry over, with alignment numbered left, right, centre.

`styleId` indexes the artboard's **component numbering**, the same space `parentId` uses — against the
corpus it resolves all 150 runs, while resolving it against the styles in declaration order resolves
4. That is the fourth distinct id space in this format.

Over the corpus this produces 117 labels, 113 carrying text and 112 carrying a size, with real
strings recovered from real files.

**Not covered — rich text.** A drawable whose runs differ in style needs more than one format can
carry; 28 of 117 texts in the corpus have more than one run, though runs often share a style. Also
uncovered: the font a style names (`fontAssetId` resolves to a font asset whose bytes are read but
not turned into a typeface), text modifiers and their ranges — the mechanism behind Rive's animated
per-character effects — text-follow-path, variable-font axes and OpenType features, and `TextInput`.

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
That is a `skeleton2d` or `path` design question, not something this codec can settle, and inventing
a lossy mesh approximation would produce geometry that looks plausible and is wrong. Bones, skins,
tendons and weights are therefore read past, and `Mesh`/`MeshVertex` with them.

**Also not covered:** wiring a resolved image onto the `Image` drawable that references it, so an image
asset arrives as data but does not yet draw. Animated geometry and paint, per above. Loop mode, work-area trimming, and playback
speed, which the animation states and this importer does not yet carry. `Feather`, 154 instances, a
paint effect whose home is arguably `@flighthq/effects` rather than this codec. Dashes, which no
corpus file uses. And deformable meshes, bones and skinning; text; assets; and nested artboard
linkage. The state-machine *descriptor* is likewise unread; per the charter its *runtime* is a
separate future cell and never a codec concern.

**Crumbs.** Three, all asset facts, and all `Reject` because each ends the parse:
`rive.invalid-header` (missing or wrong fingerprint, or a header that ends early),
`rive.truncated-object-stream`, and `rive.unknown-property-width` — a property key declared neither
by this reader nor by the file's own table, after which the next key's position is unknowable. That
last one is the format's own unrecoverable case, not a Flight limitation.

A file from another format generation is **refused** rather than misread: the property numbering
differs between generations, so a wrong-generation parse would produce a confident, wrong document
instead of failing. Only major version 7 has been read, and anything else emits
`rive.unsupported-version`.

**Verification status.** The container grammar is **verified against 64 real editor-authored `.riv`
files**, all of which decoded completely — 82,543 core objects with no unread byte and no unknown
property. The corpus was Rive's own Android runtime test assets, fetched for verification and
deliberately **not committed**: whether a third-party `.riv` may live in this repo as a fixture is a
licensing decision, so the suite ships synthetic fixtures only and the corpus run is reproducible on
demand rather than standing in CI.

That corpus earned its keep immediately. Against synthetic fixtures alone the decoder passed 30
tests while being unable to read a single real file, because it treated the file's table of contents
as the source of property widths — the exact "synthetic test that encodes the same guess as the
parser" failure. Real bytes exposed it at once, then exposed the alternate-key gap behind it.

Alongside the corpus, the primitives are checked against definitions outside this codebase (LEB128
against its arithmetic definition; float and integer reads against IEEE-754 and little-endian byte
patterns), cursor discipline is checked structurally, and every wire fact is mutation-tested.

**What remains unverified:** only current-generation files were tested, all major version 7. The
reader ignores the version fields entirely, so it neither rejects a future file nor adapts to an
older generation, and no pre-7 file has been tried.
