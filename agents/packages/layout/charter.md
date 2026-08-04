---
package: '@flighthq/layout'
crate: flighthq-layout
draft: false
lastDirection: 2026-08-04
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# layout — Charter

## What it is

`@flighthq/layout` is the renderer-neutral rectangle-layout cell. It resolves a flat,
parent-before-child `LayoutTree` into caller-owned `Float32Array` rectangles, using intrinsic width and
height pairs supplied by the caller. Each node has two independent roles: its `kind` and
`containerStyle` arrange its children, while its `itemStyle` is interpreted by its parent.

The built-in policies are anchor, flex, and grid. The resolver registry is open and last-write-wins,
so an application can register a vendor-prefixed container kind without changing the core. Built-ins
are separately imported registrars; creating a state does not install them.

## North star

A small, headless layout primitive that is useful beneath scene graphs, imported visual artifacts,
tools, and application UI without owning any of them. Its successful resolution path writes directly
into numeric buffers without allocation. The anchor resolver is one forward, linear propagation pass;
heavier policies stay opt-in and tree-shakable.

## Boundaries

- **Depends only on `@flighthq/types`.** Layout owns rectangle policy, not scene nodes, rendering,
  resources, signals, or logging infrastructure.
- **No constraint solving.** Cross-node equations, IK, Cassowary-style relationships, and Rive
  constraints are a separate future system. This package propagates rectangles through a tree.
- **Text measurement and line composition remain in `@flighthq/textlayout`.** A text consumer supplies
  its measured width and height through the intrinsic-size buffer; layout does not shape or wrap text.
- **Grid is not a table engine.** Grid provides fixed/fraction/intrinsic tracks, gaps, row-major
  placement, and spans. Table semantics such as header association, row/column data modeling,
  virtualization, and accessibility are a consumer variation over those rectangles.
- **No display-node binding.** Applying a resolved rectangle to a node, including scale-to-fit, is a
  later binding concern. Format importers may translate authored layout data into descriptors, but
  this package does not import formats or mutate scene graphs.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-04] Flat numeric-buffer boundary.** `LayoutTree.nodes` is parent-before-child;
  `intrinsicSizes` carries two numbers per node and `out` carries absolute x/y/width/height as four
  floats per node. The caller owns both buffers. This keeps the compute seam portable and avoids a
  per-node result-object allocation.
- **[2026-08-04] Container and item roles stay distinct.** A node's container role belongs to its own
  `kind`/`containerStyle`; its item role belongs to `itemStyle` interpreted by the parent resolver.
  One style object cannot silently change meaning when a node gains children.
- **[2026-08-04] Open resolver registry; opt-in built-ins.** `registerLayoutResolver` is
  last-write-wins and accepts `null` to unregister. `registerAnchorLayoutResolver`,
  `registerFlexLayoutResolver`, and `registerGridLayoutResolver` are separate assembly points.
- **[2026-08-04] Viewport alignment is shared vocabulary, scaling is not layout style.** Anchor items
  reuse `ViewportAlign`. `ViewportScaleMode` is deliberately absent: scale mode describes how content
  is bound into an already-resolved rectangle, not how the rectangle is resolved.
- **[2026-08-04] Expected failures use sentinels plus a shakeable explanation.** Resolution returns
  `false`, stores a compact failure record on `LayoutState`, and `explainLayoutResolution` materializes
  caller-facing detail. `enableLayoutGuards` is imported separately.

## Composition findings

- **Viewport is the N=1 case of the same primitive.** The current viewport/stage-fit path combines one
  aligned child with a later scale binding. Anchor layout can express the rectangle/alignment half
  without changing viewport today. `noscale` maps directly; `showall`, `noborder`, and exact-fit modes
  remain in the later rectangle-to-node binding because they change content scale.
- **Rive layout maps at the codec boundary.** Rive/Yoga `LayoutComponent` (409),
  `LayoutComponentStyle` (420), `LayoutSizingStyle` (1056), `LayoutNodeStyle` (1057),
  `LayoutParticipant` (1066), and `NestedArtboardLayout` (452) translate container fields to a
  `FlexLayoutContainerStyle`, per-component fields to `FlexLayoutItemStyle`, and measured content to
  intrinsic sizes. The measured corpus reaches 194 objects in 11 of 37 files. Rive constraints and
  data binding do not become layout fields. The codec now returns those descriptors and index-matched
  display targets while keeping intrinsic sizes, rectangle output, and node binding caller-owned.
- **Numeric-boundary policy follows statechart rather than forking it.** The canonical citation is
  `packages/statechart/src/statechart.ts` — the source contract comment on the exported
  `setStatechartRegionDuration`, immediately above that function. Layout instantiates the same inbound
  boundary through the intrinsic-size buffer that its caller fills: the solver receives plain numbers
  and never learns what content produced them. There is no committed prose heading to link. Retain the
  path plus exported API name because `npm run api` and `exports:check` track that name; replacing it with
  an invented heading would make the reference less durable.

## Open directions

1. A scene2d rectangle-to-node binding that consumes resolved rectangles and applies
   `ViewportScaleMode` without coupling the solver to nodes.
2. **Settled — Rive translation stays at the codec boundary.** `scene2d-formats` now emits generic
   layout descriptors and targets; this package remains free of Rive types and import logic.
3. Whether a table consumer needs named lines, implicit track growth, or dense auto-placement over the
   deliberately smaller grid core.
