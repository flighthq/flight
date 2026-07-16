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

## Two-tier testing

- **Tier 1 — default dispatch.** `findGraphHitTarget` / `hitTestGraphPoint`: eligibility gate, then a
  coarse region test (`hitArea`, or the node's bounds via its kind handler). A node with a `hitArea`
  consumes here; children are not descended. No path or pixel math ever runs on this path.
- **Tier 2 — explicit refine.** `findGraphHitTargetDetailed(root, x, y, out, shapeFlag=true)` fills a
  `HitTestResult { node, subIndex, localX, localY }`: it may recurse *into* a consumed unit, run the
  shape-accurate per-kind test (`shapeFlag`), and resolve a sub-index via `registerHitTestDetailed(kind, fn)`
  (tile index, list row, glyph). Broad-phase (AABB) rejects before any exact test. This is the home of
  the `event.hitTarget` / sub-index information — obtained by *asking*, never auto-populated.

Per-kind accuracy is a **registered seam**, honest about its ceiling: Shape does true path winding
(via `@flighthq/path`); bitmap-alpha (`@flighthq/surface`) and glyph (`@flighthq/textlayout`) land as
those neighbors allow, documented as bounds fallbacks until then.

## Dispatch

`event.target` is the atomic unit the hit resolved to; `event.currentTarget` is the node whose handler
is firing as it bubbles; the deep child (`hitTarget`) is a Tier-2 result, not a hot-path field.
Bubbling, cancellation (a handler can stop the bubble), capture, click/double-click/`releaseOutside`,
and rollover-chain diffing are unchanged.

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
`register*` per kind**, so its heavy dependency is pulled only when called. `registerDefaultHitTestPoints`
stays bounds-only and dependency-light (no shape/path/surface/text).

- **Broadphase** — `InteractionManagerOptions.spatialIndex` (a `@flighthq/spatial` index) +
  `refreshInteractionSpatialIndex(manager)`; pointer dispatch queries it instead of walking the tree,
  front-to-back-consistent with the linear pick. The 240 Hz acceleration.
- **Shape-accurate Tier-2** — `registerAccurateShapeHitTest()` (opt-in, pulls `@flighthq/shape` +
  `@flighthq/path`): winding test against fill regions under `shapeFlag` for Shape/Scale9Shape; Tier-1 stays
  bounds. Fully unit-tested.
- **Bitmap-alpha Tier-2** — `registerAccurateBitmapHitTest(threshold)` (opt-in, pulls `@flighthq/surface`):
  pixel-alpha under `shapeFlag`, bounds fallback when pixels are unreadable. Positive path is functional-suite
  territory (jsdom can't rasterize); unit tests cover wiring + fallback.
- **Text glyph sub-index Tier-2** — `registerAccurateTextHitTest()` (opt-in, pulls `@flighthq/text` +
  `@flighthq/textlayout`): registers a `registerHitTestDetailed` resolver for TextLabel/RichText that maps the
  point to a **character index** via `getTextLayout` + `computeRichTextCharIndexAtPoint` (the generic
  glyph-rect/char-index API that already existed on `TextLayoutResult`; `getRichTextCharBoundaries` gives the
  rect). `-1` when no layout yet. Fully unit-tested (fake fixed-advance measure provider gives a real layout).

## Boundaries (still out)

- A focus/tab navigation manager consuming `focusable`/`tabIndex` (fields exist; consumer deferred).
