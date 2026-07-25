---
package: '@flighthq/displayobject-formats'
updated: 2026-07-25
by: builder3
---

# displayobject-formats — Status Log

> Append-only handoff log, newest entry on top.

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
