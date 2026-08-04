---
package: '@flighthq/scene2d-formats'
updated: 2026-08-04
by: builder3
---

# scene2d-formats — Status Log

> Append-only handoff log, newest entry on top.

## 2026-08-04 — Rive authored layout descriptors

Rive artboard import now returns one `RiveLayoutImport` per independent authored layout root: a
parent-before-child `LayoutTree` plus display targets in matching index order. The importer does not
allocate intrinsic or output buffers, run layout, or mutate display transforms; the caller measures
the targets, supplies `@flighthq/layout`'s intrinsic pairs, owns resolution, and chooses the later
rectangle-to-node binding.

The translation preserves Rive's own two-pass contract: a `LayoutComponentStyle` supplies the node's
`containerStyle`, while its sizing supplies the `itemStyle` interpreted by the parent. A
`LayoutParticipant` contributes sizing to its display host rather than a phantom node. Flex covers
direction/RTL/reversal, alignment, wrap, point gap and insets, fixed basis, fill fractions, and cross
stretch. Grid covers fixed/fraction/auto template tracks and placement/spans; stack becomes one
overlapping 1×1 grid cell. Focused unit tests cover the role split, caller-intrinsic boundary,
independent roots, flex/grid/stack, unresolved style references, and the full `.riv` import wiring.

Property names, keys, defaults, runtime flags, enums, and behavior were derived from canonical
`rive-app/rive-runtime` revision `8efe18ec7b52a02139844ffe71438c00de13037e`: the layout definitions
under `dev/defs`, `include/rive/layout/layout_enums.hpp`, `src/layout_component.cpp`, and the matching
`src/layout/*.cpp` appliers. The checkout was temporary and no fetched source is committed. Coverage
records the unsupported Yoga behavior, notably margins/absolute offsets, percentages and min/max,
wrapped-line packing, advanced grid tracks/implicit growth/cell alignment, and live animated/bound
descriptor refresh. The old flex/alignment fields marked `runtime:false` upstream are not treated as
runtime gaps.

## 2026-08-03 — Rive: consolidated insight record

Everything from the Rive build worth carrying forward, in one place. The entries below this one are
the chronology; this is what a fresh agent needs before touching `rive*.ts`.

### The corpus, and how to speak about it

**37 real files.** Fetching Rive's Flutter example assets yields 41 paths, four of which are **Git LFS
pointers** — 131-byte text files beginning `version https://`, which the importer correctly rejects as
not-a-Rive-file. Any count must say 37. Corpora are fetched on demand and deleted, never committed.

**Corpus-first is not optional here, it is the only thing that worked.** The container passed 30
synthetic tests while unable to open a single real `.riv`. Every serious defect in this codec — the
property-width table, the alternate wire codes, unnamed state machines, UTF-8-mangled asset payloads —
was found by a real file and none by a fixture. A synthetic test encodes the same guess as the parser,
so it can only confirm the guess.

### Measurement discipline, learned the hard way twice

**A measurement is only as good as the space it was taken in.** I recorded "83 of 96 draw rules cross a
parent boundary" and used it to argue the ordering model could not serve Rive. It was counted in the
**component tree**; ordering permutes the **display tree**, and the two disagree, because a component
whose parent is not itself a display node reparents up to the nearest one. Measured through the real
import path: of 61 rules, **33 honored, 13 cross-parent, 15 naming a non-display end**. The honorable
case is the majority. Both counts were honest; one counted the wrong tree.

**Verify an id's addressing before building on it.** Three id conventions here were guesses that had to
be checked against every instance, and two came out against the obvious reading:
- `assetId` is a **position** in the asset list, not the id an asset states — positional resolves all
  61 image references, stated resolves none.
- Solo's `activeComponentId` (296) **is** a component index — all 9 resolve to a component whose parent
  is the Solo itself.
- **Four id spaces do not interchange**: `parentId`→components, `interpolatorId`→all artboard objects,
  `assetId`→asset list by order, `styleId`→components.

**When a fresh ad-hoc probe contradicts a shipped corpus-verified result, suspect the probe.** It cost
a false alarm on component numbering once, and a wrong `Shape.data.graphics.drawPaths` reading later
(the real payload is `data.commands`, a flat token buffer). Dump the keys before concluding.

### Format facts that are not guessable from the spec

- The **table of contents is a supplement, not the source of property widths** — a built-in width table
  is required, plus the alternate codes (keys 9 and 13) which fixed 11 files on their own.
- ToC field codes are 2 bits packed **four to a 32-bit word**, using only that word's low byte.
- `StateMachine` extends `Animation`, so its name is key **55**, not the component's 138. Reading 138
  leaves every state machine unnamed.
- Text and blob payloads **share one wire code**; asset bytes must be kept whole rather than UTF-8
  decoded, which is what `isRiveCoreBytesProperty` exists for.
- Rive states rotation in **radians**; `Node2D.rotation` is degrees.
- Rive's placement enum: **0 = before, 1 = after** the target.
- A `DrawRules` governs the node it is **parented to**, so the association needs no extra id.
- A `ClippingShape` clips **its parent**, not its children.

### The remaining gaps, ranked, and what kind of thing each is

Ranked by share of the 37 real files (full table in [coverage](../../scene2d-format-coverage.md)):
rigging 57%, layout 30%, constraints 30%, data binding 22%, variable-font axes 19%, feather 5%,
mesh 3%. Cross-checked against animation, which ranks identically: of 3,503 keyed objects (0
unresolved), **369 target bones and 53 target layout — rigging alone is 10.5% of all animation**, every
other unread family under 2%.

The ranking matters less than the **kind** of each:

- **Rigging is the gap**, not one of seven. It is blocked on a decision, not on effort.
- **Layout, constraints, and data binding are runtime _systems_, not document data.** Rive ships a
  layout engine, IK solvers, and a view-model binding runtime. Whether a format importer should grow
  those is a scope ruling, and reading the objects without the systems buys nothing.
- **Feather belongs to the effects tier**, not here.
- **Variable-font axes** is the one unblocked item of real size: 19% of files, and it fits inside the
  existing text seam without crossing a boundary.

### The rigging gap is *not* the skeleton2d gap — the sharpest thing to know

`skeleton2d` already models bone weights: `Skin2D` carries `influenceCounts` / `influences` per vertex
on a `MeshAttachment2D`. So Flight **has** weights-on-a-triangle-mesh. Rive weights **bezier path
control points** (`Weight`, `CubicWeight` on vertices, with `Tendon` / `Skin` / `RootBone`). That is a
different primitive, not a missing feature of the same one.

So closing skeleton2d's own gaps would **not** unblock Rive, and the open charter direction is narrower
than "build skinning": it is *where a second weight carrier lives* — a `skeleton2d` attachment kind, a
`path` capability, or a new primitive. Stating it as "Rive needs skinning" invites the wrong fix.

### What silence costs, and where it is spent

Two Rive shortfalls are applied rather than reported, because both were **visible wrongness** rather
than missing features: `Solo` drew every variant stacked (61 hidden across the corpus once fixed), and
draw rules were dropped silently. Everything genuinely unrepresentable is crumbed instead —
`rive.draw-rule-crosses-parent` for a rule that would need reparenting out of a compositing group,
`rive.solo-unresolved-active`, `rive.draw-rule-unresolved`. The test for which: if a correct file from
Rive's own editor produces it, it is a crumb; if it is our incompleteness, it belongs in coverage.

## 2026-08-03 — Rive Solo fixed; the remaining gaps ranked by what real files actually use

**Solo was a visible wrongness, not a missing feature.** A `Solo` shows exactly one child at a time
(alternate limbs, button states). It derives from Node, so it imported as a plain node and **every
variant drew at once, stacked**. The active child is component-index property 296 — verified before
building, against all 9 Solos in the corpus: every one resolves to a component whose parent is the
Solo itself. Applying it hides 61 stacked variants across the 37 files. Five tests; a mutation kills.

**The corpus is 37 files, not 41.** Four fetched paths are Git LFS *pointers* — 131-byte text files
beginning `version https://` — which the importer correctly rejects. My earlier "41 real files" was
wrong; the import numbers were right, the denominator was not.

**Ranked remainder**, by share of the 37 real files, now in [coverage](../../scene2d-format-coverage.md):

| gap | objects | files |
| --- | --- | --- |
| Rigging / skinning | 2,664 | 21/37 (57%) |
| Layout | 194 | 11/37 (30%) |
| Constraints (IK, translation) | 179 | 11/37 (30%) |
| Data binding | 691 | 8/37 (22%) |
| Variable-font axes | 120 | 7/37 (19%) |
| Feather | 62 | 2/37 (5%) |
| Mesh / vertex art | 291 | 1/37 (3%) |

Cross-checked against animation, which ranks the same: of 3,503 keyed objects (0 unresolved), 369
target bones and 53 target layout — **rigging alone is 10.5% of all animation**, everything else under
2%. That is the number that says rigging is not one gap among seven; it is the gap.

284 package tests, check green.

## 2026-08-03 — SVG internal DTD entities fixed, in `@flighthq/xml` (cross-package, user-authorised)

The gap the W3C corpus surfaced. A document declaring `<!ENTITY Smile "<circle …/>">` and expanding it
with `&Smile;` lost all the expanded content, silently.

**The fix could not be a bigger entity table.** A replacement is *markup*, and entity decoding ran on
already-extracted text — too late to produce elements. It is now a source-level pre-pass: declarations
are collected while the DOCTYPE is stripped (that walker already tracked quote state and bracket depth,
so it knew the subset's bounds; it simply discarded them), then substituted into the source before the
tree is built. An entity-expanded document now imports byte-identically to the literal spelling.

**Two forms are deliberately not honored.** External entities (`SYSTEM` / `PUBLIC`) resolve a URL or
file path at parse time — a document reading whatever the process can reach — and parameter entities.
Neither is a gap; the regex requires a quoted replacement directly after the name, which excludes both
without testing for either.

**The budget is the security property.** Entities that reference each other expand exponentially.
A mutation removing the budget was the useful part of the work: my *first* bomb test survived it — it
was too small to explode, so it proved nothing. Rebuilt at six levels, ten references deep, it
materializes exactly 10,000,000 characters unbudgeted and stays under 200k budgeted. **A test for a
resource bound has to actually exceed the bound, or it only tests the happy path.**

Whole-repo gates on the shared parser: check green, 1,352 files / 15,408 tests.

## 2026-08-03 — Rive draw order imported on `NodeOrderList`; my own cross-parent figure was wrong

Rebased onto `origin/develop`, which brought in `@flighthq/node`'s `NodeOrderList` — the ordering API
the draw-order model proposes, already implemented and in the contract lane. Rive draw rules now import
onto it (`riveDrawOrder.ts`). A `DrawRules` is parented to the node it governs and names a `DrawTarget`,
which names the drawable and the before/after side, so it maps one-to-one onto
`setNodeOrderListEntryBelow` / `Above` with no interpretation beyond resolving two ids.

**The correction that matters: my recorded "83 of 96 cross a parent boundary" was measured in the wrong
space.** It compared **component-tree** parents. Ordering permutes **display-tree** children, and the
two disagree — a component whose parent is not itself a display node reparents up to the nearest one,
so components that are not component-siblings frequently *are* display-siblings. Measured through the
real import path over 41 real `.riv` files: of **61 rules, 33 are honored, 13 cross a parent boundary
(`rive.draw-rule-crosses-parent`), and 15 name an end that is not a display node
(`rive.draw-rule-unresolved`)**. The honorable case is the majority, not the exception.

That number had been used to argue the ordering model could not serve Rive, so the correction is
recorded in [coverage](../../scene2d-format-coverage.md) rather than quietly swapped. The lesson
generalises: **a measurement is only as good as the space it was taken in.** Both figures were honest
counts of real files; one was counting the wrong tree.

Cross-parent rules are reported as fidelity loss rather than approximated by reparenting, which would
move the governed node out of the group whose alpha, blend, and clip it composites under.

41 real files import with zero crashes. 278 package tests; `check scene2d-formats` green, and the
whole-repo gates passed on the rebased tree (1,351 files / 15,390 tests).

## 2026-08-03 — SVG met the W3C conformance suite; `inherit` was deleting geometry

Third and last codec to get the corpus treatment. 34 documents from the W3C SVG 1.1 conformance
suite — shapes, path data, transforms, units, gradients, painting, masking, structure, styling, text.

**It came through far better than Lottie.** Zero crashes, zero non-finite transform values, every
document produced geometry on the first run; 410 source drawables produced 520 `drawPath` records
(above one-to-one because `use` instantiates). Every shortfall traced to a declared exclusion —
`pattern` fills, soft masks — each already announced by a crumb. Two did not.

**Bug — `inherit` silently deleted the element's geometry. Fixed.** `inherit` is the CSS-wide keyword
for "the parent's computed value", legal on every presentation attribute, and the suite's own colour
test uses it. Read as a paint value it resolved to no fill and no stroke, so the element imported as a
shape with an **empty command list**: the geometry was gone and nothing was reported. Resolved at the
single style seam in `resolveSvgStyle` — for an inherited property the declaration is dropped, since
an absent declaration already resolves to the parent's value; the three non-inherited properties
(`display`, `filter`, `opacity`) name the parent explicitly, because dropping the declaration would
reset them to their initial value instead. Six regression tests; a mutation kills five of them (the
sixth is a deliberate no-parent boundary case).

**Gap — internal DTD entities, and it is not ours.** `<!ENTITY Smile "<circle …/>">` expanded by
`&Smile;` loses all its content, silently. `@flighthq/xml` strips the DOCTYPE wholesale and decodes
only the five predefined entities, so the reference survives as literal text rather than markup.
Cross-package, so recorded in [coverage](../../scene2d-format-coverage.md) rather than built. Entities
are legal SVG 1.1 but no mainstream design tool emits them; the silence is the part worth fixing.

**All three codecs have now read real files, and each one hid a defect no fixture could reach** —
Rive could not open a single real `.riv` while passing 30 synthetic tests; Lottie crashed on 78% of
real exports while passing a full conformance census; SVG silently dropped geometry for a keyword its
own conformance suite exercises. Corpora are fetched on demand and deleted, never committed.

273 tests, `check scene2d-formats` and `docs:check` green.

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

Verified against 64 real editor-authored files fetched on demand from Rive's Android test assets and
never committed. All 64 decode: 82,543 core objects, 37,595 components, no unresolved parent.

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
