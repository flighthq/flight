---
package: '@flighthq/scene2d-formats'
status: partial
score: 76
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source
  - tests
  - functional-scenes
  - coverage-document
  - assessment.md
---

# scene2d-formats -- Review

Three codecs in one target-named package -- SVG, Lottie, and Rive -- each producing Flight
display-object trees from a different visual-authoring format. This review is measured against
source in `packages/scene2d-formats/src/` (16,353 lines across 46 files), the 901-line coverage
document (`agents/scene2d-format-coverage.md`), the seven functional render scenes under
`functional/scenes/`, and the package types used in `@flighthq/types`.

## Verdict

The package is the broadest format importer in the SDK and the only one covering three codecs.
All three produce working display trees; SVG and Rive have multi-backend functional render scenes
(six SVG scenes, one Rive scene); Lottie has none. The Rive codec is the deepest -- binary
container, type registry with inheritance, per-artboard display construction, mutable-content
animation, skeleton, skin, draw order, solo, state machine, layout, and the `Scene2DDocument`
named-graph output. Lottie is second in breadth -- every standard layer family, analytic easing,
separated spatial tangents with arc-length parameterization, auto-orientation, and a substantial
mutable-content binder. SVG covers the static authoring core: paths, shapes, text, gradients,
transforms, viewBox, defs/use/symbol, CSS selectors, and clip/mask degradation.

Package shape and contract discipline are sound. Two blessed lanes (`.` and `./contract`),
`"sideEffects": false`, types in `@flighthq/types`, no `@flighthq/sdk` imports, no top-level
registration side effects. The description field says "SVG and Lottie" and should be updated to
include Rive. `@flighthq/image` appears in both `dependencies` and `devDependencies`, which is
redundant (the runtime import in `riveScene2DDocument.ts` is real). The 20 workspace dependencies
are all justified by source imports. `@flighthq/layout` is notably absent despite the Rive layout
module -- `riveLayout.ts` emits layout descriptors through `@flighthq/types` only, correctly
keeping the package data-only.

Test suite: 356 test cases, 773 assertions, all colocated one-test-per-source. Both Lottie and SVG
have dedicated conformance test files (1,285 and 658 lines). Every Rive module has its own test
file. No test uses a real external asset; all fixtures are hand-authored. The coverage document
records three historic corpus runs (Lottie against lottie-web at `550c1b042`, SVG against W3C at
`62359229b`, Rive against rive-flutter at `a3707655f`), none of which are reproducible in CI -- they
are external fetch-on-demand evidence.

The score of 76 (up from 71) reflects the SVG functional scenes and steady Lottie conformance
hardening since the prior review; it is held below 80 by the still-absent Lottie functional scene,
the unwired Rive skin, the Lottie render-stack gap, and the Rive layout box-model gap.

## Present capabilities

### SVG codec (`svgDocument.ts`, 1,781 lines)

Single exported function: `createScene2DFromSvgDocument(source, diagnostics?, options?)`.

Geometry: paths via `@flighthq/path-formats` (`parseSvgPathData`), `<rect>` with round corners
(single radius -- elliptical `rx`/`ry` is approximated), `<circle>`, `<ellipse>`, `<line>`,
`<polygon>`, `<polyline>`.

Paint: solid fill and stroke from presentation attributes and CSS, dashes with `stroke-dasharray`
and `stroke-dashoffset`, `fill-rule`, `fill-opacity`, `stroke-opacity`, `opacity`, `visibility`,
`display`. Colour parsing covers `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`,
`hsla()`, percentage alpha, `currentColor`, and a built-in named-colour table.

Gradients: `<linearGradient>` and `<radialGradient>` with `gradientUnits` (objectBoundingBox and
userSpaceOnUse), `gradientTransform`, `spreadMethod`, stop inheritance from referenced gradients,
`currentColor` on gradient stops. Focal coordinates (`fx`/`fy`) are parsed but not lowered to
Flight's gradient matrix.

Text: `<text>` and `<tspan>` with font-family, font-size, font-weight, font-style, text-anchor,
fill, opacity. Multi-run `<tspan>` sequences emit `TextFormatRange`s. Nested `<tspan>` `display`,
`visibility`, and `opacity` each reach emitted runs.

Structure: `<g>` groups, nested `<svg>` with viewBox and preserveAspectRatio, `<defs>`, `<use>`,
`<symbol>` (with viewport), element ID indexing, recursion-guarded reference resolution.

Transforms: the full `transform` attribute grammar (matrix, translate, scale, rotate, skewX,
skewY), decomposed to Flight's Transform2D. The viewBox-to-viewport matrix implements
preserveAspectRatio including `none`, `xMidYMid`, and alignment variants.

Clipping: `clipPath` (objectBoundingBox and userSpaceOnUse), with reference resolution, `clip-rule`
on the path, recursive `<use>` inside `clipPath`. Intersected clips via `intersectClipRegions`.
Masks (`<mask>`) degrade to hard clip through `createClipRegionFromPath`.

CSS: inline style, presentation attributes, `<style>` element with basic selectors (element, `.class`,
`#id`, attribute, combinations). Specificity and cascade order. `inherit` resolves through the
ancestry chain.

Images: `<image>` with `href`/`xlink:href`, resolved through `SvgDocumentImportOptions.resolveImageResource`.
`preserveAspectRatio` on images reuses the viewport fitting rule.

Diagnostics: `svg.invalid-document` (Reject), `svg.unsupported-filter` (Skip),
`svg.unsupported-element` (Skip for `filter`, `pattern`, `foreignObject`, `script`, `animate*`,
`set`).

**Functional render scenes** (6): `svg-import` (solid fills), `svg-clip-path` (both clip-path unit
modes), `svg-image` (four-colour orientation test), `svg-preserve-aspect-ratio` (meet vs none),
`svg-transform` (mirroring via negative scale), `svg-use-symbol` (two-instance scaling). All gate
Canvas, WebGL, and WebGPU backends.

### Lottie codec (`lottieDocument.ts`, 1,735 lines)

Two exported functions: `createScene2DFromLottieDocument(source, diagnostics?, options?)` and
`applyAnimationClipToLottieDocument(clip, time)`.

Layers: shape (3), precomposition (0), image (2), null (3), solid (1), text (5). Audio (6) and
camera (13) are silently skipped.

Transforms: position (vector or separated X/Y), anchor, scale (percent-to-fraction), rotation,
skew, opacity. Spatial tangents (`to`/`ti`) with 150-sample arc-length parameterization. Combined
and separated auto-orientation (`ao`). Hold segments.

Geometry: bezier paths, rectangles with corner radius, ellipses, polystars with inner/outer
roundness and direction (`d: 3` reversal). Static trim.

Paint: solid fill and stroke; gradient fill and stroke (linear and radial) with packed colour +
opacity stops, overall paint opacity, gradient winding (`r`). Dash, cap, join, miter (static and
animated `ml2`). Multiple fills and strokes are preserved in file order. Every paint applies to
every path in its group.

Animation: analytic segment-local cubic-Bezier easing with per-component splitting; the
`LottieMutableAnimationTarget` closure writes sampled values into captured state and triggers a
`rerender()` rebuild of the whole shape command stream. Animated properties include path vertices,
rectangle/ellipse/polystar geometry, fill/stroke/gradient colour/opacity/width, and mask paths.

Blend modes: all 16 mapped -- 5 fixed-function to `BlendMode`, 11 advanced to
`AdvancedBlendMode` reported in `advancedBlends`.

Other: precomposition `st`/`sr` folding, recursion-guarded references, markers as clip events,
hidden layers (`hd`) suppress own content while preserving spatial transform for children,
image resolution through `LottieDocumentImportOptions.resolveImageResource`.

Diagnostics: `lottie.invalid-document` (Reject), `lottie.unresolved-asset` (Drop),
`lottie.unresolved-image` (Skip), `lottie.recursive-precomposition` (Drop),
`lottie.text-missing-document` (Drop), `lottie.unsupported-expression` (Skip),
`lottie.unsupported-shape-modifier` (Skip), `lottie.unsupported-shape-item` (Skip),
`lottie.incompatible-animated-shape-path` (Drop).

**No functional render scene.** This is the single most consequential test gap in the package.

### Rive codec (15 source files, ~3,900 lines)

Three exported functions: `parseRiveDocument(source, diagnostics?)` (container),
`createRiveObjectGraph(document, diagnostics?)` (artboard trees),
`createScene2DFromRiveDocument(source, diagnostics?)` (display trees + animation),
plus `createScene2DDocumentFromRiveDocument(source, diagnostics?)` (named-graph document),
`applyAnimationClipToRiveDocument(clip, time)`, `createRiveSkeleton2D(artboard)`, and
`createRiveSkin2D(artboard, skinnableIndex, boneIndices, points, diagnostics?)`.

Container: `.riv` fingerprint validation, major-version gate (7), LEB128 varint, float32, uint32,
string, and bytes reading. Field-type table of contents for unknown properties.

Object graph: artboard-scoped component trees with parentId resolution, cycle detection
(tortoise-and-hare), numbering that starts from the artboard as index 0.

Display construction: every type derived from `Node` becomes a `DisplayObject`; paths contribute
geometry to their owning shape. Transforms: x (with legacy key), y, rotation (radians to degrees),
scaleX, scaleY, opacity. Blend modes: 5 fixed-function + 11 advanced.

Geometry: points paths (straight, cubic mirrored, cubic asymmetric, cubic detached vertices with
polar handles), corner rounding (positive and negative radii with natural rounding), parametric
paths (rectangle with per-corner radii, ellipse, polygon, star, triangle). Closed-path control.
Path transforms baked into geometry.

Paint: ordered fill list, ordered stroke list, solid colour (ARGB unpacked), linear and radial
gradients with stop colours and gradient-overall opacity, fill rule (nonZero/evenOdd), stroke
thickness, cap, join. Trim (synchronized and sequential modes). Dash (with offset, percentage
lengths, and wrapped offset).

Animation: `createRiveAnimationClips` reads keyed objects and keyed properties from the stream.
`KeyFrameDouble` and `KeyFrameColor` are consumed; `KeyFrameBool`, `KeyFrameId`, `KeyFrameString`,
`KeyFrameUint`, and `KeyFrameCallback` are diagnosed and dropped. Node2D properties (x, y,
rotation, scaleX, scaleY, opacity) bind through `Node2DAnimationTarget`. Geometry and paint
properties bind through `RiveMutableTarget` closures that write back onto the core object and
trigger shape rebuild. Bone properties bind through `createSkeleton2DBoneAnimationTarget` with
per-axis paths (TranslationX/Y, ScaleX/Y, Rotation). Easing: cubic bezier, three damped-sine
variants, hold. Custom interpolators. Loop mode, work area, speed metadata.

Skeleton: `createRiveSkeleton2D` flattens artboard bones into a parent-before-child `Skeleton2D`
array via topological sort by depth. Root bones read x/y; child bones derive position from parent
bone length. Rive radians are converted to degrees. No shear.

Skin: `createRiveSkin2D` reads Weight/CubicWeight records, unpacks four-byte-per-word influence
packing, resolves tendon-to-bone indirection (1-indexed tendons), computes inverse-bind offsets in
each bone's local frame. Returns a `Skin2D` with influence counts and float32 influences.

Clipping: `applyRiveClipping` resolves clipping-shape source references, computes relative
transforms through the full artboard component tree, transforms clip geometry from source space to
clipped node space, simplifies per fill rule, and intersects multiple clips per node.

Draw order: `applyRiveDrawOrder` resolves DrawRules/DrawTarget references, validates sibling-ness
in the display tree, and applies Above/Below through `NodeOrderList`. Cross-parent rules are
diagnosed as fidelity loss.

Solo: `applyRiveSolo` hides every child but the active one for each Solo node.

Text: `createRiveRichText` builds `RichText` with per-run `TextFormatRange`s, font from asset name,
variable-font axes (OpenType tags unpacked from uint), colour from style paint child, alignment,
line height, letter spacing.

Layout: `createRiveLayoutImports` translates Rive LayoutComponent trees into `FlexLayoutContainerStyle`
and `GridLayoutContainerStyle` descriptors, with `FlexLayoutItemStyle` and `GridLayoutItemStyle` for
children. Supports flex direction, wrap, justify, align-items, align-self, align-content, gap, and
grid tracks (repeat, fraction, point, auto). Does not read margin, absolute offset, percentage,
min/max sizing, or wrapped-line packing.

Assets: `createRiveFileAssets` collects the asset list (order-indexed), with embedded byte payloads.

State machine: `createRiveStateMachines` reads layers, states, transitions (duration, exit time,
flags, target state), and inputs (bool/number/trigger) as a plain-data descriptor.

Document: `createScene2DDocumentFromRiveDocument` builds the named-graph output with nested-artboard
slots, image resource references with MIME detection from magic bytes, and texture bindings.

Diagnostics: `rive.invalid-header`, `rive.unsupported-version`, `rive.truncated-object-stream`,
`rive.unknown-property-width` (all Reject); `rive.component-without-parent`, `rive.unresolved-parent`,
`rive.parent-cycle`, `rive.path-outside-shape`, `rive.unresolved-clipping-source`,
`rive.draw-rule-unresolved`, `rive.draw-rule-crosses-parent`, `rive.solo-unresolved-active`,
`rive.asset-contents-unowned`, `rive.image-mime-type-undetected`, `rive.unresolved-weight-bone`,
`rive.keyed-object-unbound`, `rive.unrepresentable-bone-scale`, `rive.text-unresolved-style`,
`rive.state-machine-part-unowned` (all Drop); `rive.nine-slice-substituted`,
`rive.parametric-path-substituted`, `rive.stroke-cap-substituted`, `rive.stroke-join-substituted`,
`rive.text-align-substituted`, `rive.animation-loop-substituted` (all Recover);
`rive.path-kind-unsupported`, `rive.keyframe-kind-unsupported`, `rive.drawable-kind-unsupported`
(Drop/Skip).

**Functional render scene** (1): `rive-import` generates a `.riv` in memory, imports it, samples
animation, and asserts gradient fill, second-paint stroke, clipping, corner sign, and gradient output
across Canvas, WebGL, and WebGPU.

## Gaps

### Cross-codec

1. **Lottie has no functional render scene.** SVG has six, Rive has one, Lottie has zero. Every pixel
   the Lottie importer produces is verified only through jsdom unit tests that cannot rasterize. This
   is the widest evidence gap in the package.

2. **No real-asset CI gate.** All three corpus runs are external fetch-on-demand evidence. The Rive
   corpus has a reproducible recipe (upstream commit + manifest SHA-256); the Lottie and SVG ones
   have only historical Flight commit pins with no upstream revision or manifest. None is a standing
   CI check.

### Lottie

3. **Render stack scoping is flat.** Every paint applies to every path in its group. The format
   specifies that each style scopes over preceding shapes (including nested groups) and that
   repeated styles render in reverse order. This is explicitly noted in `lottieDocument.ts` as
   requiring a scoped-stack rewrite and is recorded in `status.md`.

4. **Track mattes (`tt`/`td`/`tp`) are typed and silently dropped.** The boundary types exist on
   `LottieDocument` but no reader consumes them. `CompositeEffect` supplies operators but no
   source/target isolation attachment.

5. **Shape-style blend (`bm`) is typed and unread.** The per-style blend consumer requires the
   scoped render stack above to have a per-paint display target.

6. **Radial gradient highlight (`a`/`h`) is typed and unread.** Requires a focal-point relation.

7. **Text stroke (`sc`/`sw`) and embedded glyph outlines (`chars`/`fonts`) are unread.**

8. **Composed masks, inverted masks, feathered masks are silently dropped.** Only a single
   additive non-inverted mask is lowered.

9. **Animated trim, repeater, merge paths, round corners are diagnosed and dropped.**

### SVG

10. **Focal coordinates (`fx`/`fy`) on `<radialGradient>` are parsed but not lowered** to the
    gradient transform matrix.

11. **Elliptical `rx`/`ry` on `<rect>` is approximated** by a single circular radius.

12. **CSS `!important`, descendant/child/sibling selectors, `stop-color`/`stop-opacity` in
    stylesheets, percentage/relative length units, viewport overflow, and `vector-effect`/`paint-order`
    are unread.** These are recorded in the assessment's exhaustive table and in the coverage document.

13. **`<switch>`, named colours outside the local table, and paint-server fallback tokens are unread.**

### Rive

14. **`createRiveSkin2D` is exported through `contract.ts` but has zero callers in any production
    import path.** It is called only from `riveSkin.test.ts`. The skeleton is built and bone animation
    is wired, but no imported path is deformed by the skin. This is the largest single gap in the Rive
    codec, measured at 22 of 38 corpus files.

15. **Only `KeyFrameDouble` and `KeyFrameColor` are consumed.** `KeyFrameBool`, `KeyFrameId`,
    `KeyFrameString`, `KeyFrameUint`, and `KeyFrameCallback` are diagnosed and dropped. At the corpus
    baseline: 50 Id, 34 Uint, 18 Callback, 13 String, and 8 Bool tracks are unread.

16. **Constraints/IK, data binding, and feather are type-registry entries only.** No importer reads
    or emits them.

17. **Rive `Mesh`/vertex art is unimported.** `MeshVertex` is registered but a mesh path emits
    `rive.path-kind-unsupported`.

18. **Layout box model is incomplete.** `riveLayout.ts` reads no margin, absolute offset, percentage,
    min/max sizing, or wrapped-line packing field.

## Charter contradictions

1. **`package.json` description says "SVG and Lottie documents"** but Rive is a full third codec.
   The description should say "SVG, Lottie, and Rive documents."

2. **The charter's North star says "output is ordinary Flight data and display nodes, never a live
   document runtime."** The `LottieMutableAnimationTarget` closures and `RiveMutableTarget` closures
   capture mutable state and trigger shape rebuilds -- these are not "live document runtime" in the
   charter's sense (they drive explicit playback, not implicit rendering), but the mechanism is worth
   naming, since the closures hold writable references to format-specific state that lives across
   frames. The charter's "explicit caller seam" rule is satisfied because playback requires an
   explicit `apply*` call.

3. **No contradiction found with the diagnostic calibration.** The prior review's finding about
   project-fact crumbs has been addressed: the coverage document now records project-level gaps, and
   the asset-fact/project-fact distinction is stated in its header. The existing crumb set is
   reasonable: crumbs like `lottie.unsupported-expression` and `rive.keyframe-kind-unsupported` are
   defensible as author-actionable (bake expressions before export; the keyframe type is a fact about
   the specific file's authored content).

## Contract & docs fit

**Export lanes:** Two lanes only (`.` and `./contract`), no stray subpath exports. The public lane
exports 6 functions; the contract lane re-exports everything from 8 modules. Both lanes function as
documented.

**Type home:** All exported types live in `@flighthq/types`. The source files define no exported
`interface` or `type` (internal interfaces like `SvgStyle`, `RivePaint`, `RiveTrim` are
module-private). `import type` is on its own line throughout.

**Side effects:** `"sideEffects": false` in `package.json`. No top-level side effects in source;
all registration goes through `@flighthq/scene2d-resources`. Module-level scratch objects (`_sampleScratch`,
`_floatView`, `_bindSpace`) are internal allocation, not observable side effects.

**Readonly:** Function parameters are consistently `Readonly<>` for object types. Out-parameters
are avoided; functions allocate and return fresh values.

**Sentinel returns:** `parseRiveDocument` returns `null` for untraversable files.
`createScene2DFromRiveDocument` returns an empty artboard array rather than null on parse failure.
`createScene2DDocumentFromRiveDocument` returns `null` when no artboards import. These are
consistent sentinel patterns.

**Diagnostics:** Use `reportImportDiagnostic` from `@flighthq/importdiagnostics/contract` with
structured severity codes (Reject, Skip, Drop, Recover). No inline warning comments -- gaps are
in `status.md` or the coverage document.

**Naming:** Exported function names include the full type name (`createScene2DFromSvgDocument`,
`applyAnimationClipToRiveDocument`, `createRiveObjectGraph`). `get*`, `has*`, and `is*` prefixes
are used correctly. `readRive*` helpers are module-private.

**Allocation:** `create*` functions allocate; helper functions write into the caller's structures.
Pool verbs are not used (no hot-path allocation).

**Dependencies:** 20 workspace dependencies, all reachable from source imports. No circular
dependencies. No `@flighthq/sdk` import. `@flighthq/layout` is correctly absent (layout types
are consumed via `@flighthq/types`).

**Test alignment:** Every source file has a colocated `.test.ts`. Describe blocks mirror exported
function names and are alphabetized. SVG and Lottie each have a dedicated conformance test file
in addition to the main test.

## Candidate open directions

1. **Lottie functional render scene.** The codec's output has never been rasterized in a functional
   test. Given that SVG now has six scenes and Rive has one, this is the most straightforward
   evidence gap to close.

2. **Wire the Rive skin into the production import path.** `createRiveSkin2D` works (9 tests, 20
   assertions) but `createScene2DFromRiveDocument` does not call it. The `PathAttachment2D` deformer
   exists in `@flighthq/skeleton2d`. The bridge is a display/playback contract between the deformed
   attachment and the imported display shape.

3. **Lottie render-stack scoping.** The current flat model is documented and measured but produces
   wrong output for multi-style groups that rely on the scoping order. This is the largest
   correctness gap in the Lottie codec.

4. **Widen Rive keyframe consumption beyond Double and Color.** The Id, Uint, String, Bool, and
   Callback types need per-target-family evidence before binding -- the prior assessment's finding
   that widening without an evidenced target recreates the `KeyFrameColor` scalar-read failure.

5. **Rive layout box model.** Margin, absolute offset, percentage sizing, min/max constraints, and
   wrapped-line packing are absent.

6. **SVG focal coordinates.** `fx`/`fy` are parsed and stored but need a focal-point relation
   against the gradient transform to be lowered.

7. **Reproducible corpus baselines.** The Rive corpus has a manifest SHA-256; extending this to
   Lottie and SVG (with upstream revisions and deterministic fetch recipes) would make all three
   refreshable rather than historical.
