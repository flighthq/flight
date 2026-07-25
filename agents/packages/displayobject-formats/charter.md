---
package: '@flighthq/displayobject-formats'
draft: false
lastDirection: 2026-07-25
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# displayobject-formats — Charter

## What it is

`@flighthq/displayobject-formats` imports visual-authoring documents into Flight display-object trees.
It owns document-level structure and presentation above the narrower path/shape codecs: containers,
text, reusable definitions, gradients, clips/masks, resource references, and transforms.

The first and current format is full static SVG-document import. This is the reusable interchange
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
  `displayobject`/`node`, and hard geometry masking to `clip`.

## Current SVG scope

Whole-document SVG: paths and primitive geometry, fills/strokes/dashes, linear/radial gradients,
groups/nested SVG, transforms/viewBox/preserveAspectRatio, presentation attributes and common CSS
selectors, defs/use/symbol, text/tspan style runs, images through an explicit resolver, clipPath, and
mask recovery to Flight's hard clip primitive.

SVG animation, scripts, foreignObject, live DOM behavior, and filter graphs are not retained. Filter
effects belong to `@flighthq/effects`; application behavior remains application-owned.

## Decisions

- **[2026-07-25] Package name and first format.** User-directed review queue named
  `@flighthq/displayobject-formats` as the home and directed full SVG-document import first.
- **[2026-07-25] Lottie and Rive do not begin in the SVG increment.** Lottie remains a later
  animation-backed import phase. Rive additionally waits for `@flighthq/skeleton2d`; either may earn
  a dedicated package when its dependency and bundle shape are designed.
- **[2026-07-25] No hidden resource acquisition.** SVG `<image>` values resolve through
  `SvgDocumentImportOptions.resolveImageResource`; unresolved images emit structured diagnostics.

## Open directions

1. SVG paint-server patterns and soft/luminance mask fidelity beyond Flight's hard `ClipRegion`.
2. Whether Lottie remains a module here or becomes the already-chartered `lottie-formats` cell.
3. Whether Rive's parser and state-machine data justify the already-chartered `rive-formats` cell
   once skeleton2d is available.
