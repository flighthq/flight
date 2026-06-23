# Depth Review: @flighthq/interaction

**Domain**

Interaction for a 2D/scene-graph display system: point-in-node hit testing, an interaction/event-dispatch manager (pointer down/up/move/cancel, wheel, context menu, keyboard, click/double-click synthesis, rollover/over/out, capture-and-bubble with cancellation, pointer capture), and object-vs-object overlap detection. This is the "input-to-scene-graph" layer an OpenFL/Pixi/Phaser-class SDK exposes — the canonical references are Flash/OpenFL's `InteractiveObject`/`MouseEvent` model and Pixi's `EventSystem`/`FederatedEvents`.

**Verdict: solid — 68/100**

The pointer-dispatch half of this package is genuinely deep and well-shaped; it captures most of the OpenFL event model faithfully (bubbling, cancellation, rollover-chain diffing, click/double-click, releaseOutside, multi-pointer state, pointer capture, lazy subscriber-gated dispatch). The hit-testing half is shallow: it is bounding-box-only across every node kind, the pixel/shape-accurate path is stubbed out, and two kinds (tilemap, quad-batch) are explicit `// TODO`s. As a standalone "interaction library" it is a strong event router bolted to a placeholder hit-tester.

## Present capabilities

Hit testing (`hitTests.ts`, `displayHitTests.ts`, `spriteHitTests.ts`):

- `findGraphHitTarget` — front-to-back depth-first traversal (reverse child order) returning the topmost hit node. This is the correct, canonical picking traversal.
- `hitTestGraphPoint` — boolean "does this subtree contain the point" (front-agnostic).
- `hitTestGraphLocalBounds` — world→local inverse-transform then local-bounds containment. The single primitive every default hit function delegates to.
- `hitTestDisplayObjects` — AABB overlap of two display objects' world bounds (OpenFL `hitTestObject` analogue).
- `registerHitTestPoint(kind, fn)` — per-`Kind` registry so hit behavior is opt-in and tree-shakable; correct architectural shape for this codebase.
- A full bank of per-kind default hit functions (bitmap, shape, text, richtext, textinput, video, renderview, htmlview, movieclip, stage, sprite, tilemap, quadbatch), with the correct distinction that containers (stage, movieclip) have no self-hit area.

Interaction manager (`interactionManager.ts`) — the strong part:

- Full pointer event set: `dispatchInteractionPointerDown/Up/Move/Cancel`, `...Wheel`, `...ContextMenu`, `...KeyDown/...KeyUp`.
- Click and double-click synthesis with a configurable `doubleClickDelay`, per-pointer `lastClickTarget`/`lastClickTime`.
- `onReleaseOutside` (down-on-A, up-elsewhere) — a non-obvious detail most libraries miss.
- Rollover/rollout done correctly as an ancestor-**chain diff** (`onPointerRollOut`/ `RollOver` fire only for nodes entering/leaving the chain) plus simple `onPointerOver`/`Out` on the target — this mirrors Flash's roll-vs-over semantics precisely.
- Capture-phase-less **bubbling** up to the manager root with per-node **cancellation** (`isInteractionSignalCancelled`).
- Multi-pointer support: `pointerStates`/`pointerCaptures` keyed by `pointerId`; `captureInteractionPointer` / `releaseInteractionPointer` (setPointerCapture analogue).
- Lazy dispatch gating: `isPointerSignalNeeded` / `hasInteractionSignalSubscriber` walk the graph (or a tracked subscriber count) so no hit-testing happens when nothing is listening — a real performance design, not an afterthought.
- Signal enablement via `enableInteractionSignals` / `getInteractionSignals` on runtime slots (correct entity/runtime pattern), with `connect/disconnectInteractionSignal` tracking and a `once` option.
- `connectInputToInteraction` bridges a raw `InteractionInputSource` (the `@flighthq/input` seam) with `coordScale`, returning a disposer.
- Local-coordinate computation: `PointerEventData` carries `worldX/Y`, `x/y`, and per-node `localX/localY` recomputed via inverse world transform as the event bubbles.

## Gaps vs an authoritative interaction library

- **Pixel / shape-accurate hit testing is absent (missing-by-omission).** `shapeFlag` is threaded through `findGraphHitTarget` → registry → every default function, but every implementation ignores it (`_shapeFlag`) and returns bounds containment. OpenFL's `hitTestPoint(x, y, shapeFlag=true)` and Flash's per-shape/per-glyph picking are the defining feature of an authoritative hit-tester; here the parameter is dead wiring. A shape needs path/fill containment, a bitmap needs alpha-threshold testing, text needs glyph-box testing. None exist.
- **Tilemap and quad-batch hit testing are literal `// TODO` stubs** that fall back to the sprite bounds test — so a tilemap reports a hit anywhere in its bounds rather than on a populated tile, and a quad-batch cannot identify which quad/index was hit. For a batch/tilemap-centric SDK this is a core missing capability, not an edge case.
- **No `hitArea` override.** Flash/Pixi let an object delegate its hit region to another object/shape (invisible larger touch targets, simplified proxy regions). No equivalent.
- **No per-object interaction gating.** There is no `mouseEnabled` / `mouseChildren` / `interactive` / `eventMode` analogue. The only gating is the node-level `enabled` flag (which suppresses the node and its subtree entirely) — you cannot make a container non-interactive while keeping its children pickable, or vice versa.
- **Overlap detection is AABB-only.** `hitTestDisplayObjects` is the lone overlap function: no point-vs-object public entry on world coords, no shape-vs-shape (transformed/rotated) overlap, no penetration/contains queries. An authoritative library offers a small overlap family, not one bounding-box test.
- **No spatial acceleration.** Picking is a linear full-graph DFS every event. There is no broadphase (quadtree/grid/BVH) or dirty-region cache, so large scenes pay O(n) per pointer event. Acceptable as a v1 default, but a mature picking library is expected to offer an acceleration path.
- **No cursor management.** No per-node cursor/`buttonMode`/`useHandCursor` concept, which OpenFL and Pixi both fold into the interaction layer.
- **No drag/gesture layer.** Drag-start/drag/drop, tap vs. long-press, pinch/rotate gesture recognition. Arguably a separate package, so treat as _missing-by-design_ unless the SDK intends interaction to own gestures — worth a one-line scope decision.
- **No touch-vs-mouse `pointerType` semantics beyond pass-through.** `pointerType` is carried on the event but nothing branches on it (e.g. hover suppression for touch).

## Naming / API-shape notes

- Naming is consistent and self-identifying: every public function carries the full type word (`dispatchInteractionPointerDown`, `hitTestGraphLocalBounds`, `findGraphHitTarget`), matching the codebase rule. Verb prefixes are correct (`is*`/`has*` for predicates, `enable*` for the signal opt-in, `register*` for the registry).
- The `default*HitTestPoint` bank is exported individually, which is right for tree-shaking, but there is no `registerDefault*` convenience to wire the whole built-in bank in one call — callers must `registerHitTestPoint` each kind by hand. A single opt-in registrar (still side-effect-free, still tree-shakable when unused) would close the usability gap.
- `findGraphHitTarget` vs `hitTestGraphPoint` traverse in **opposite** child orders (front-to-back vs natural). Correct for their respective jobs, but undocumented why they differ — a comment on `hitTestGraphPoint` would prevent a future "fix" that breaks one.
- `shapeFlag` should not ship as a parameter on the public surface until at least one default honors it; right now it advertises a capability the package does not have.
- `findGraphHitTarget` ignores `pointerCaptures` (capture lives only in the manager) — fine, but means the bare hit-test API and the manager have subtly different "what gets hit" semantics; worth a note.

## Recommendation

Treat the dispatch layer as essentially done and bring the hit-testing layer up to its level. Priority order: (1) implement `shapeFlag` for shape (path/fill containment) and bitmap (alpha-threshold) hit tests, or remove the parameter until it is honored; (2) replace the tilemap and quad-batch `// TODO`s with real per-tile / per-quad picking that can report the sub-index hit; (3) add a `hitArea` override and a `mouseEnabled`/`mouseChildren`-style gating pair so containers and proxies behave like the OpenFL model this otherwise tracks closely; (4) add a small overlap family (point-vs-object on world coords, transformed shape-vs-shape) beside `hitTestDisplayObjects`; (5) decide and document whether cursor management, gestures, and a spatial broadphase belong here or in neighbor packages. Items (1)–(2) are the difference between "solid" and "authoritative" — the dead `shapeFlag` and the two TODO kinds are the clearest unfinished-by-omission signals in the package.
