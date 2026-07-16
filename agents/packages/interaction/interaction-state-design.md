# Interaction hit-test model (model of record)

Status: **blessed, building** — 2026-07-16. Signed direction from the design thread; this is the
authoritative spec the `@flighthq/interaction` re-architecture executes against. Supersedes the
earlier "NodeInteractionState cell" note (the cell survives, but eligibility inverts and
`hitTestChildren` is removed).

## Principles (the four decisions everything else follows from)

1. **Eligibility is opt-in.** A node is a hit *candidate* only if it explicitly volunteered. Most
   objects never do, so hit testing is cheap by default and a decorative node is invisible to the
   pointer with zero configuration. This is why interaction is a separate subsystem.
2. **Node vs. dispatch are different layers.** The node answers "am I a candidate, and what's my
   region." *Dispatch* (bubbling) answers "who hears it." You register what is *hittable*; you listen
   *wherever* — the two are decoupled.
3. **Reference, don't snapshot.** A hit region that is linked to live geometry (a node, a path, the
   node's own bounds) never needs re-syncing, because the test reads the source at query time and
   composes the transform live. Snapshotting a rect is the only thing that drifts.
4. **Pay for precision.** The default hot path is coarse and cheap (a rectangle/bounds test, no
   pixels, no paths). Shape-accuracy and "which child inside" are an *explicit second call* — never on
   the per-move path. This is what keeps 240 Hz viable.

## Eligibility (opt-in)

- `hitTestEnabled` is the opt-in flag, and it now **defaults to `false`**. A node participates in hit
  testing only after `setNodeHitTestEnabled(node, true)`. (This inverts the previously-shipped
  default; the sound example's explicit `false` calls on decorative overlays disappear — they were
  never eligible.)
- `hitTestEnabled` doubles as the toggle: a volunteered node can be switched off without losing its
  region/cursor/listeners.
- **Listening is decoupled.** Signals dispatch by bubbling from the resolved hit up the ancestor
  chain; a listener on an *un-volunteered* ancestor still fires, because a volunteered descendant (or
  its own `hitArea`) produced the hit. You register geometry candidates; you listen anywhere.
- **Guard for the footgun.** A separately-importable `enableInteractionGuards()` warns (through
  `@flighthq/log`) when a node carries an interaction listener but neither it nor any descendant is a
  hit candidate — the "why isn't my click firing" case. Costs production nothing (inversion rule).

## `hitArea` — the linked-region primitive

Setting a `hitArea` makes the node an **atomic hit unit**: it stops recursion (children are no longer
individual targets), it **consumes** (the hit resolves to *this* node), and it defines the region. The
value is one of:

| `hitArea` value | Linked to source? | Tier | Resolved in… |
|---|---|---|---|
| `Rectangle` | no — a snapshot (the only drifting form) | 1 | node **local** space |
| `'bounds'` (sentinel) | yes — the node's own local bounds, i.e. the union of its subtree; auto-invalidated | 1 | node local |
| `Path` (share the Shape's own path object) | yes — editing the path is seen immediately | 2 (winding) | node local |
| `Node` (proxy) | yes — reads that node's live geometry + transform | 1/2 | the **proxy's world** space |

**Coordinate rule (this also settles interaction charter Open direction #2):** the region resolves in
the space of whoever *owns* the geometry. A bare `Rectangle`/`Path`/`'bounds'` is owned by the
referencing node → authored in that node's local space, and the world hit-point is inverse-mapped
through the node's world matrix (so it tracks position **and** rotation/scale). A `Node` proxy is
owned by the proxy → tested in the proxy's world space, wherever it sits. The user never writes matrix
math; they pick the space by picking the reference.

`'bounds'` is the **10 000-children answer**: register one parent, `hitArea='bounds'`, and the whole
subtree is approximated by one region — no per-child registration. When a handler needs *which* child,
it makes the Tier-2 call.

## Query & registration API (final shape, 2026-07-16)

Two independent axes, kept independent: **what the caller wants back** (a method) × **accuracy** (coarse
vs precise — a `*Precise` sibling method, not a flag). There is no `shapeFlag` and no accuracy enum;
precision *is* which function you call, which keeps cost greppable and each path distinct (also good for
the C/C++ port).

```
Coarse:   hitTestGraphPoint          findGraphHitTarget          findGraphHitTargets
Precise:  hitTestGraphPointPrecise   findGraphHitTargetPrecise   findGraphHitTargetsPrecise
Detail:   describeGraphHit(node, x, y, out)          // resolve sub-index + local coords on a known node
```

- **Coarse** = the bbox path (the `hitTestRegistry`). Cheap; used for move/hover/drag/spatial.
- **Precise** = each node tested by its registered exact provider (the `hitTestExactRegistry`), **falling
  back to bounds per kind** where none is registered — best-available, not an absolute guarantee (hence
  `Precise`, not `Exact`). `enableInteractionGuards` can warn on the degrade.
- **`findGraphHitTargets(Precise)`** is the hit-**stack** (all nodes under the point, front-to-back).
- **`describeGraphHit`** resolves the sub-index (text char / tile / quad) on a node you already have — a
  compute, not a walk. The exact provider returns `-1` (miss) / `0` (hit, no sub-element) / `n` (index),
  so `Precise` reads "hit iff ≥ 0" and `describeGraphHit` reads the value.

Registration is an open registry — register only what you need:

```
registerHitTest(kind, fn)          // coarse bbox handler for a kind (fn: (source,x,y) => boolean)
registerHitTestPrecise(kind, fn)   // exact provider for a kind    (fn: (source,x,y) => number)
registerDefaultHitTests()          // the built-in coarse bank for all kinds
registerShapeHitTest()             // exact fill winding (pulls shape/path)
registerBitmapHitTest(threshold)   // exact pixel alpha (pulls surface); bounds fallback where unreadable
registerTextHitTest()              // exact char index (pulls text/textlayout)
```

Each per-kind exact registrar is a separate module, so its heavy dependency tree-shakes unless imported;
`registerDefaultHitTests` stays bounds-only and dep-light.

## Dispatch

The primary user surface is **signals**, not these queries: you `connectInteractionSignal(node, …)` and a
slot fires. `findGraph*` / `describeGraphHit` are the engine primitives dispatch runs. Precision is a
first-class signal-path feature, not a query verb: `createInteractionManager(root, { precise: true })`
flips dispatch from `findGraphHitTarget` to `findGraphHitTargetPrecise`, so a connected slot fires only on
a real hit and bubbles normally. (A per-node `setNodeHitTestPrecise` is named for later, not yet built.)
`event.target` is the node the hit resolved to; `event.currentTarget` is the node whose handler is firing
as it bubbles. Bubbling, cancellation, capture, click/double-click/`releaseOutside`, rollover-chain
diffing are unchanged.

## Performance posture (240 Hz)

Four levers, cheapest first: reused event objects (have) · dispatch skipped when nothing subscribes
(have) · **opt-in eligibility so only volunteers are tested** (this work) · an **opt-in manager
registry / broadphase** that skips the tree walk entirely for huge scenes (future — charter's spatial
index; the walk-but-test-only-volunteers baseline is order-correct and fine into the low thousands).

## What changes on `main`

- `NodeInteractionState` loses `hitTestChildren` (its jobs are now eligibility, `hitArea`, and
  bubbling). `hitTestEnabled` keeps its name but its **default flips to `false`** (opt-in).
- `hitArea` gains the `'bounds'` sentinel and `Path` value; setting it makes the node a flatten
  boundary (stop-recursion + consume) — a behavior change from today's "children first, then hitArea."
- `findGraphHitTarget` / `hitTestGraphPoint` become eligibility-gated and hitArea-flatten-aware.
- New: `findGraphHitTargetDetailed` + `registerHitTestDetailed` (Tier-2), a Shape path-winding
  detailed handler, and `enableInteractionGuards`.
- `@flighthq/interaction` gains a dependency on `@flighthq/path` (for `containsPathPoint`).
- The sound example opts its buttons/tracks in and drops the decorative-overlay `false` calls.

## Built (follow-up pass, 2026-07-16)

- **Guard** — `enableInteractionGuards()` / `disableInteractionGuards()` / `explainInteractionHitEligibility()`
  (separately-imported, `@flighthq/log`). Warns once when a listener is connected to a node with no
  hit-testable subtree (the opt-in footgun). Core seam: `setInteractionConnectGuard`.
**Tree-shaking rule for Tier-2 accuracy:** each kind's accurate/detailed hit test is a **separate opt-in
`register*` per kind**, so its heavy dependency is pulled only when called. `registerDefaultHitTests`
stays bounds-only and dependency-light (no shape/path/surface/text).

- **Broadphase** — `InteractionManagerOptions.spatialIndex` (a `@flighthq/spatial` index) +
  `refreshInteractionSpatialIndex(manager)`; pointer dispatch queries it instead of walking the tree,
  front-to-back-consistent with the linear pick (coarse or precise). The 240 Hz acceleration.
- **Exact providers** (into `hitTestExactRegistry`, consulted by the `*Precise` queries + `describeGraphHit`):
  `registerShapeHitTest()` (fill winding, pulls shape/path), `registerBitmapHitTest(threshold)` (pixel alpha,
  pulls surface; bounds fallback where unreadable — jsdom can't rasterize, so its positive path is
  functional-suite territory), `registerTextHitTest()` (char index via `getTextLayout` +
  `computeRichTextCharIndexAtPoint` — the generic char-index/rect API already on `TextLayoutResult`; pulls
  text/textlayout, fully unit-tested via a fake fixed-advance measure provider).
- **Dispatch precise bit** — `InteractionManagerOptions.precise` flips dispatch to the precise walk (the
  #5 "really clicked" ergonomic).

Superseded by the "Query & registration API" section above: `shapeFlag`, `findGraphHitTargetDetailed`,
`registerHitTestDetailed`, `registerHitTestPoint`/`registerDefaultHitTestPoints`, and the `registerAccurate*`
names are all gone.

## Boundaries (still out)

- A focus/tab navigation manager consuming `focusable`/`tabIndex` (fields exist; consumer deferred); the
  per-node `setNodeHitTestPrecise` bit (manager-level `precise` exists).
- The precise-degrade guard warning (Precise falling back to bounds for an unregistered kind) — designed,
  not yet wired into `enableInteractionGuards`.
