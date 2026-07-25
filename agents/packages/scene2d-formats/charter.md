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
are not part of the core compatibility guarantee; an unresolvable case must emit an accurate
`ImportDiagnostic` Skip crumb rather than silently approximating it or mislabeling a resolved-empty
clip as an unresolved reference.

SVG animation, scripts, foreignObject, live DOM behavior, and filter graphs are not retained. Filter
effects belong to `@flighthq/effects`; application behavior remains application-owned.

## Lottie scope

The Lottie module accepts Bodymovin JSON or the data-only `LottieDocument` boundary type and returns
a display subtree plus animation data. It performs no playback and acquires images only through
`LottieDocumentImportOptions.resolveImageResource`.

The common Bodymovin export path is the AAA baseline: shape, precomposition, image, null, solid, and
text layers; parenting and 2D transforms; static and animated paths, fills, strokes, gradients,
trim paths, basic masks, and composition markers as clip events. Document frame `f` maps to seconds
as `(f - ip) / fr`; duration is `(op - ip) / fr`. Hidden layers and unsupported records remain
visible through structured `ImportDiagnostic` crumbs rather than disappearing silently.

The first implementation would Skip-crumb expressions, text animators, effect layers, audio,
cameras, 3D transforms, exotic mattes, unsupported blend modes, arbitrary time remapping, and shape
modifiers without a Flight equivalent. Static hard masks may recover to `ClipRegion`. These scope
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
(`shape`), deformable meshes + bones/skinning (`skeleton2d` — 2D mesh warp / `MeshAttachment2D`, **not**
the 3D `mesh`/`skeleton3d`), animations (`animation`), and a `Scene2DDocument` whose slots + linkage
come from Rive's named + nested artboards. Rive's **state-machine runtime** (inputs driving
transitions) is a *runtime interpretation*, not a parse — it stays a distinct future runtime cell (the
node/sim split, à la `particles`/`particleemitter`); this codec emits the state-machine *descriptor* as
data only.

## SWF scope

SWF (Flash) is the **archetypal named-graph source** — the format #3 was modeled on; its MovieClip
symbols (nested timelines), named instances, and `SymbolClass` linkage *are* the slot + linkage model.
Format parse only: `.swf` bytes → shapes (`shape`), bitmaps (`image`), text (`text`), MovieClip symbols
→ `movieclip`/`timeline`, named instances + linkage → a `Scene2DDocument` with slots. ActionScript
(AVM1/AVM2 bytecode) is **out of scope** — it is code, application-owned, like SVG `<script>`
(`DoAction`/`DoABC` Skip-crumbed). SWF is a **legacy/preservation** capability (Flash is EOL; the value
is the archive of Flash content and validating #3 against the original), not a forward-authoring path —
Rive owns that.

## Decisions

- **[2026-07-25] Package name and first format.** User-directed review queue named
  `@flighthq/scene2d-formats` as the home and directed full SVG-document import first.
- **[2026-07-25] One target package, many source codecs.** SVG, Lottie, Rive, and SWF are all
  **codecs within `scene2d-formats`**, never separate source-named `*-formats` packages — `-formats` is
  target-named (this package produces 2D display / `Scene2DDocument` data), exactly as `scene3d-formats`
  holds glTF/OBJ/USD/3DS/MD5/AWD2. This supersedes the reserved `svg-formats`, `lottie-formats`, and
  `rive-formats` cells. SVG is the first increment; Lottie, then the richer Rive and legacy SWF, are
  later increments here.
- **[2026-07-25] Heavy binary sources inject deps through seams, not packages.** Rive's `.riv` binary
  reader and SWF's `CWS`/`ZWS` decompression are injected via registered seams (the
  `registerAwd2DeflateDecompressor` precedent in `scene3d-formats`), so each codec stays in this package
  while its heavy dependency remains optional and tree-shakeable. A source's *weight* never earns it a
  source-named package.
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
5. The named-graph output mode's slot/linkage handshake, shared across the SVG-from-XD, Rive, and SWF
   codecs through the one `Scene2DDocument` slot contract
   ([`scene2d-resources`](../scene2d-resources/charter.md)).
