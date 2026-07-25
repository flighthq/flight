---
package: '@flighthq/displayobject-formats'
updated: 2026-07-25
by: builder3
---

# displayobject-formats — Status Log

> Append-only handoff log, newest entry on top.

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
displayobject/shape dependencies; arbitrary precomposition time remapping needs either an explicit
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

Created the package and `createDisplayObjectFromSvgDocument`. The importer assembles SVG document
structure into DisplayContainer/Shape/TextLabel/RichText/Bitmap nodes, delegates path data to
`path-formats`, and reports format loss through opt-in `ImportDiagnostic[]` crumbs.

Implemented geometry primitives, solid and gradient fills/strokes, dashed strokes, inherited
presentation styles plus basic id/class/tag CSS, affine transforms, viewBox/preserveAspectRatio,
defs/use/symbol, styled tspan runs, explicit image-resource resolution, clipPath, and mask-to-hard-clip
recovery. Current deliberate gaps are SVG filter graphs, patterns, soft/luminance masks, live
animation/scripting/foreignObject, and independently positioned later tspans (flattened with a crumb).
