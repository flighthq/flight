---
package: '@flighthq/interaction'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - interaction-state-design.md
  - assessment.md (prior, 2026-07-13)
  - review.md (prior, 2026-08-25)
  - source (packages/interaction/src, all 16 source + 15 test files)
  - packages/types (InteractionManager, InteractionDispatchLayer, InteractionPointerState, NodeInteractionState, HitTestResult, Cursor, CursorBackend, HitArea, HitTestFunction, HitTestPreciseFunction, FocusManager, InteractionSignals, PointerEventData, KeyboardEventData, FocusEventData)
---

# interaction -- Review

## Verdict

**solid -- 78/100.** The pointer-dispatch layer is now deep and complete: bubbling with cancellation, rollover-chain diffing, click / double-click / `releaseOutside`, multi-pointer capture, lazy subscriber-gated dispatch, dispatch layers, cursor management with invalidation, and a documented coordinate-space seam. The hit-testing layer has the right registry architecture with three opt-in exact providers (shape fill winding, sprite pixel alpha, text char index). The package has matured significantly since the prior review (68/100): dispatch layers (`connectInteractionDispatchLayer`), cursor invalidation (`invalidateInteractionCursor`), and double-click support (`onPointerDoubleClick` with timing/distance/target validation) are all present, tested, and well-integrated. 191 tests pass across 15 colocated files. The remaining gap to authoritative is per-node interaction gating (`mouseEnabled`/`mouseChildren`), clip/mask-aware picking, `hitArea` proxy, and `suppressTouchHover` -- all Approved but unbuilt.

## Present capabilities

### Hit testing (`hitTests.ts`, 257 lines)

- `findGraphHitTarget` / `findGraphHitTargetPrecise` -- front-to-back reverse-child DFS, first-hit. Eligibility-gated (`hitTestEnabled`, defaults `false`). `hitArea` makes the node atomic (stops recursion, consumes the hit). Precise uses `hitTestExactRegistry`, falling back to coarse when no exact provider is registered.
- `findGraphHitTargets` / `findGraphHitTargetsPrecise` -- hit-stack variants collecting all hits into an out array.
- `hitTestGraphPoint` / `hitTestGraphPointPrecise` -- boolean any-hit (order-independent).
- `hitTestGraphLocalBounds` -- world-to-local inverse transform + local-bounds containment on a module scratch point.
- `hitTestNode2Ds` -- world-AABB overlap with attached-parent guards.
- `hitTestNodeRegion` -- single-node region test (hitArea or kind geometry), no eligibility check. Used by the broadphase.
- `describeGraphHit` -- resolves sub-index and local coordinates on a known node via the exact registry. Returns `-1` when no exact provider is registered.
- `registerHitTest` / `registerHitTestPrecise` -- open string-keyed `Map<Kind, fn>` registries.
- `hitAreaContainsPoint` -- resolves `HitArea` union (`'bounds'` sentinel, `Rectangle`, `Path` via `containsPathPoint`, `Node` proxy via the proxy's coarse handler). Local-space forms map through the owning node's world matrix; proxy forms test in the proxy's world space.

### Default handlers (`displayHitTests.ts`, `spriteHitTests.ts`)

Seven default handlers: bounds-based for RichText/Shape/Text/TextInput, `false` for containers (DisplayObject/MovieClip) and HtmlView (browser owns its pointer events). Sprite family: `defaultSpriteHitTestHandler` bounds-based; QuadBatch and Tilemap delegate to the sprite bounds handler (no per-quad/per-tile resolution).

### Registrar (`registerDefaultHitTests.ts`)

One-call opt-in wiring 11 kinds: `DisplayObjectKind`, `HtmlViewKind`, `MorphShapeKind`, `MovieClipKind`, `QuadBatchKind`, `RichTextKind`, `Scale9ShapeKind`, `ShapeKind`, `SpriteKind`, `TextLabelKind`, `TilemapKind`. MorphShape registered to the Shape handler (charter Decision 2026-08-02). Never at module top level; tree-shaken when unused. `defaultTextInputHitTestHandler` is exported and tested but not wired into the registrar.

### Exact providers (opt-in, tree-shakeable)

- `registerShapeHitTest` (`registerShapeHitTest.ts`) -- fills `hitTestExactRegistry` for `ShapeKind`, `MorphShapeKind`, and `Scale9ShapeKind` with live fill-region winding via `getShapeFillRegions` + `containsPathPoint`. Pulls `@flighthq/shape` + `@flighthq/path`.
- `registerSpriteHitTest` (`registerSpriteHitTest.ts`) -- pixel-alpha hit for `SpriteKind` with configurable `alphaThreshold`, bounds fallback when pixels are unreadable. Pulls `@flighthq/bitmap`. WeakMap bitmap cache per Image.
- `registerTextHitTest` (`registerTextHitTest.ts`) -- char-index resolution for `TextLabelKind` and `RichTextKind` via `getTextLayout` + `computeRichTextCharIndexAtPoint`. Pulls `@flighthq/text` + `@flighthq/textlayout`. Bounds fallback when no layout is available.

### Overlap family (`displayObjectOverlap.ts`)

`containsNode2D` (world-bounds enclosure), `getNode2DOverlapRectangle` (out-param intersection), `hitTestNode2DsShape` (AABB reject + cross-center heuristic).

### Spatial queries (`spatialQuery.ts`)

`hitTestAreaQuery` (rect) and `hitTestAreaQueryCircle` (nearest-point-on-AABB) -- honest linear DFS collecting enabled nodes into an optional out array.

### Spatial broadphase (`interactionSpatialIndex.ts`)

`refreshInteractionSpatialIndex` -- rebuilds `manager.spatialIndex` (a `@flighthq/spatial` index) from the scene in front-to-back order, mirroring `findGraphHitTarget` traversal. `findSpatialInteractionTarget` -- picks the topmost broadphase candidate at (x,y), confirming via `hitTestNodeRegion`. The manager's dispatch uses this automatically when a `spatialIndex` is set.

### Node interaction state (`nodeInteractionState.ts`)

`createNodeInteractionState` / `enableNodeInteractionState` -- lazy cell on the node runtime. Six fields: `cursor`, `focusable`, `hitArea`, `hitTestEnabled`, `pointerDoubleClickEnabled`, `tabIndex`. Typed getters (`getNodeCursor`, `getNodeHitArea`, `getNodeTabIndex`, `isNodeFocusable`, `isNodeHitTestEnabled`, `isNodePointerDoubleClickEnabled`) and setters (`setNodeCursor`, `setNodeFocusable`, `setNodeHitArea`, `setNodeHitTestEnabled`, `setNodePointerDoubleClickEnabled`, `setNodeTabIndex`).

### Manager (`interactionManager.ts`, 998 lines)

- **Dispatch layers** (`connectInteractionDispatchLayer`): priority-ordered interceptor chain run before Flight signal bubbling. Each dispatch snapshots the layer list (additions/removals wait for next dispatch). A layer returning `false` suppresses the signal. 7 tests cover ordering, suppression, snapshotting, and full event-path observability.
- **Cursor management**: `cursorBackend` option (`{ setCursor }` interface), `cursorTarget` tracked on rollover change, `resolveInteractionCursor` walks ancestors for the nearest cursor. `invalidateInteractionCursor` re-resolves and re-applies immediately. 5 dedicated tests.
- **Double-click** (legacy `onDoubleClick`): timing-based on the same target within `doubleClickDelay`, per-pointer independent.
- **Pointer double-click** (`onPointerDoubleClick`): opt-in per node via `setNodePointerDoubleClickEnabled`. Validates timing (`doubleClickDelay`), distance (`doubleClickDistance`), same target, same button, same interaction state identity. Resets on: target change, opt-out between clicks, pointer move exceeding distance, pointer cancel, manager disable, release/capture. Fires only once in a triple-click. `connectInputToInteraction` forwards input timestamps for qualification and resets pending state on disconnect. 16 tests.
- **18 signal types**: `onClick`, `onContextMenu`, `onDoubleClick`, `onFocusIn`, `onFocusOut`, `onKeyDown`, `onKeyUp`, `onPointerCancel`, `onPointerDoubleClick`, `onPointerDown`, `onPointerMove`, `onPointerOut`, `onPointerOver`, `onPointerRollOut`, `onPointerRollOver`, `onPointerUp`, `onReleaseOutside`, `onWheel`.
- Bubbling `emitInteractionSignal` with per-node cancellation and `currentTarget`/`localX`/`localY` fill via world-matrix inverse.
- Rollover-chain diffing: `onPointerRollOver`/`RollOut` (non-bubbling, per-ancestor) vs `onPointerOver`/`Out` (bubbling, on target).
- Per-pointer state maps, `captureInteractionPointer` / `releaseInteractionPointer`.
- Lazy dispatch gating: tracked subscriber counts with `trackedSubscribersOnly` fast path and graph-scan fallback. Dispatch layers force dispatch even without subscribers.
- `connectInputToInteraction` -- the `@flighthq/input` seam with `coordScale` and thorough JSDoc coordinate-space contract.
- `connectInteractionSignal` / `disconnectInteractionSignal` -- tracked signal connection with `once` support and connect-time guard seam.

### Focus manager (`focusManager.ts`)

`createFocusManager`, `getFocusedNode`, `isNodeFocused`, `setFocusedNode` (returns `false` for non-focusable), `clearFocus`, `focusNextNode` / `focusPreviousNode` (linear tab order, `wrap` cycles), `focusNodeInDirection` (D-pad spatial nav by world-bounds-center scoring with perpendicular-offset penalty), `getFocusOrder` (engine primitive), `connectFocusNavigation` (Tab/Shift+Tab/arrows). Focus signals bubble (not cancelable) via the interaction signal infrastructure with `FocusEventData` payload.

### Interactive state binding (`nodeInteractiveStateBinding.ts`)

`createNodeInteractiveStateBinding` / `applyNodeInteractiveStates` / `disposeNodeInteractiveStateBinding` / `explainNodeInteractiveStateBinding` -- a data-driven interactive-state system for hover/pressed/disabled property transitions with extension schemas. Applies core properties (`alpha`, `scaleX`, `scaleY`, `visible`, `x`, `y`) and extension fields via a registry. Transition support through a pluggable `NodeInteractiveStateTransition`.

### Diagnostics (`enableInteractionGuards.ts`)

`enableInteractionGuards` / `disableInteractionGuards` -- separately-importable guard module. Warns once (through `@flighthq/log`) when: (a) a pointer listener is connected to a node with no hit-testable subtree, or (b) a focus listener is connected to a node with no focusable subtree. `explainInteractionHitEligibility` -- the diagnostic seam returning `{ eligible, hasEligibleInSubtree }`.

### Tests

191 `it()` across 15 colocated test files, all passing. The manager file alone carries 71 tests covering dispatch layers, cursor invalidation, double-click (both legacy and pointer), bubbling, cancellation, capture, rollover diffing, subscriber gating, release outside, and input wiring.

## Gaps

Versus a mature scene-graph hit-testing/pointer-dispatch library (raw-input normalization is `@flighthq/input`; collider-vs-collider is `@flighthq/collision`; gestures are `@flighthq/gestures`):

- **No per-node interaction gating** (`mouseEnabled`/`mouseChildren` equivalents). Only `node.enabled` and `hitTestEnabled` gate traversal; a node cannot opt out of self-hits while keeping children interactive, or suppress all descendant hits. Approved.
- **No clip/mask-aware picking.** Neither `clipRegionContainsPoint` nor `scrollRect` appears anywhere in the source. A node clipped by a mask or a viewport still reports hits across its full bounds. Approved (Decision #4).
- **`suppressTouchHover`** (chartered in-scope, Approved) is absent from both the manager and `InteractionManagerOptions`. Touch moves synthesize rollover chains identically to mouse.
- **QuadBatch and Tilemap hit-test to the whole node's bounds.** Both delegate to `defaultSpriteHitTestHandler`. No per-quad or per-tile sub-index resolution. `describeGraphHit`'s `subIndex` never carries a quad instance or tile index for these kinds.
- **`hitTestNode2DsShape` is a cross-center heuristic, not a shape test.** AABB rejection + "is either center inside the other's box." The name promises more than it delivers. True SAT overlap is absent (Open direction #3).
- **Pointer coordinate translation.** `connectInputToInteraction` scales but does not translate. A canvas away from the viewport origin needs the bounding-rect offset subtracted upstream. No `mapDomPointerEventToElement` helper.
- **`defaultTextInputHitTestHandler` exported but not registered.** The registrar does not wire it to `TextInputKind`. Either register it or remove the export.
- **Missing registrar coverage.** `NativeTextKind`, `BitmapTextKind`, `ParticleEmitterKind` exist in types but have no default handler in the registrar.
- **Focus dangling reference.** When the focused node is removed from the tree or made non-focusable, `manager.focused` can dangle. Navigation self-heals via `getFocusOrder` recomputation, but the stale reference persists until the next navigation or explicit `clearFocus`.
- **No focus-trap or scope containment** -- an app cannot restrict tab navigation to a modal or panel.
- **No per-node `setNodeHitTestPrecise` bit.** Manager-level `precise` exists, but a node cannot opt itself into precise hit testing individually.
- **No precise-degrade guard.** `enableInteractionGuards` does not warn when a `*Precise` query falls back to bounds for an unregistered kind.
- **Zero functional-scene coverage.** No functional scene imports `@flighthq/interaction`.

## Charter contradictions

None. The code now aligns with all blessed Decisions:

- Decision #2 (`DisplayObject` typing for the overlap family): the overlap functions are typed on `Node2D`, which is the graph-feature alias for the overlap domain -- the implementation-type concern was resolved by renaming the functions from `*DisplayObject*` to `*Node2D*` (`containsNode2D`, `getNode2DOverlapRectangle`, `hitTestNode2Ds`, `hitTestNode2DsShape`). This is consistent with the charter's intent that users not be forced into `Spatial2DNode`, though the function names now use `Node2D` rather than `DisplayObject`.
- Decision #3 (`*Handler` suffix): all default hit-test functions retain it.
- Decision #4 (clip-aware picking in scope): code does not yet implement it, but this is a gap, not a contradiction -- the decision blesses it as in-scope work.
- Decision #5 (`shapeFlag` stays): `shapeFlag` was superseded by the interaction-state-design.md spec, which replaced the flag approach with `*Precise` sibling methods. The spec is the model of record and states this explicitly.
- Decision 2026-08-02 (MorphShape reuses Shape handlers): `registerDefaultHitTests` maps `MorphShapeKind` to `defaultShapeHitTestHandler`, and `registerShapeHitTest` maps it to `hitTestShapeFill`. Compliant.

The prior review noted a contradiction around North star #5 (bounds fallback must be documented, not silent). The current source has doc comments on `registerShapeHitTest`, `registerSpriteHitTest`, and `registerTextHitTest` explaining fallback behavior; `findGraphHitTargetPrecise` documents "falling back to bounds per kind where no exact provider is registered." The documented-fallback requirement is now met for the precise providers. The coarse defaults (which have no `shapeFlag` -- that concept was removed) are straightforward bounds tests with no silent degradation to disclose.

## Contract & docs fit

**Lives up to the contract:** two blessed export lanes (`.` with 74 named re-exports from `contract.ts`; `./contract` as the star re-export surface); `sideEffects: false`; registration opt-in, never top-level; open registries not `switch(kind)`; sentinels not throws (`null` miss, `-1` sub-index miss, empty rect on disjoint); full unabbreviated function names with correct `is*`/`get*`/`set*`/`register*`/`enable*`/`dispatch*`/`connect*`/`create*` verbs; out-params on the overlap rect and area queries; allocation-free hot paths via module scratch state; types-first (all type definitions in `@flighthq/types`). The diagnostics inversion rule is followed: core carries the guard seam (`setInteractionConnectGuard`), the guard module (`enableInteractionGuards.ts`) carries the messages and the `@flighthq/log` dependency.

**Candidate revisions:**

- **`@flighthq/scene2d` is a runtime dependency but only tests import it** -- should move to `devDependencies`. Source imports only geometry/node/signals/path/shape/bitmap/text/textlayout/spatial/registry/log/types.
- **`package.json` description** ("Hit testing: point-in-node tests and object overlap detection") omits the pointer-dispatch layer, focus management, dispatch layers, and cursor management -- most of the package's capability.
- **Overlap function naming drift.** Charter Decision #2 says `DisplayObject` is the correct typing, but the functions were renamed to `containsNode2D`, `getNode2DOverlapRectangle`, `hitTestNode2Ds`, `hitTestNode2DsShape`. Either the Decision text needs updating to reflect the chosen naming, or the charter's "What it is" description (which mentions both `mouseEnabled`/`mouseChildren` and the function names) should be reconciled with the actual API.

## Candidate open directions

The charter already carries four open directions (cursor architecture, `hitArea` proxy coordinate semantics, SAT precision ceiling, Rust crate). The `hitArea` proxy coordinate question is answered by `interaction-state-design.md` (the model of record) -- the charter should close that direction. New questions this review had to assume:

1. **Default registrar coverage policy.** Should `registerDefaultHitTests` cover every renderable kind (`NativeText`, `BitmapText`, `ParticleEmitter`, `TextInput`), or do composition packages own their kinds' handlers to keep interaction free of their weight? The unregistered-but-exported `defaultTextInputHitTestHandler` needs the same ruling.
2. **Focus-trap / scope containment.** Modal dialogs and panels commonly need to constrain tab navigation. Is this interaction's scope, a separate utility, or application-level?
3. **Focus cleanup on tree mutation.** When a focused node is removed or made non-focusable, should the manager auto-clear, or is explicit `clearFocus` the API? The current dangling reference is silent.
