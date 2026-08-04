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
  data binding do not become layout fields, and no Rive importer wiring is part of this increment.
- **Numeric-boundary policy follows statechart rather than forking it.** The canonical source contract
  is the comment above `setStatechartRegionDuration` in `packages/statechart/src/statechart.ts`: duration
  uses the same millisecond unit as `advanceStatechartInstance`, must be finite and non-negative, and
  zero means unavailable. Statechart publishes blend-weight numbers outbound, skeleton2d publishes
  world-matrix numbers outbound, statechart receives duration numbers inbound, and layout receives
  intrinsic-size numbers inbound. Primitive and composition layers exchange plain numbers in both
  directions, and neither learns what the other means. Any future layout duration field must cite and
  adopt the statechart contract instead of defining another zero/unit convention; this increment
  introduces no duration field. **PENDING CROSS-LINK:** builder4 confirms no committed prose anchor for
  this convention exists yet; replace this marker with that canonical heading when it lands rather than
  inventing a layout-local formulation.

## Open directions

1. A scene2d rectangle-to-node binding that consumes resolved rectangles and applies
   `ViewportScaleMode` without coupling the solver to nodes.
2. A Rive-format translation layer after importer coverage reaches the authored layout objects; the
   generic layout package remains free of Rive types.
3. Whether a table consumer needs named lines, implicit track growth, or dense auto-placement over the
   deliberately smaller grid core.
