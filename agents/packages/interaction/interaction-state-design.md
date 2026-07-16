# NodeInteractionState — design note

Status: **blessed and implemented**, 2026-07-16 (all four axes' types + gating + hitArea + cursor
stack landed; the focus/tab-order *fields* exist, their navigation-manager consumer is deferred).
Owning package: `@flighthq/interaction`; types in `@flighthq/types`. This note is the design record;
the Decisions section below is authoritative.

## Why this note exists

The sound example surfaced that Flight has **no "visible but non-interactive" state** — the only
per-node gate is `Node.enabled`, which also stops rendering. Working through it raised the real
question: *where do per-node interaction settings live, and what are they?* A bare
`node.allowInteraction` boolean is the wrong answer — it belongs on the runtime (not the lean
entity), and a single boolean immediately wants friends (children-gating, hit-area, cursor, and —
the user's point — tab order). This note specs the whole cell once so the fields don't accrete
piecemeal.

## What already exists (build on, don't reinvent)

The interaction charter (blessed 2026-07-02) already charters most of this, and a mature
implementation existed and was **lost** from the tree (review.md 2026-07-13). Remnants and ledger:

- **Orphaned header types**, already in `@flighthq/types`: `HitArea = Readonly<Rectangle> |
  Readonly<NodeAny>` (`NodeInteraction.ts`) and `Cursor` + `CursorBackend` (`Cursor.ts`).
- **Approved-but-unbuilt** (assessment ledger, Tiers 2–3): per-node gating
  `setNodeInteractive`/`isNodeInteractive` + `setNodeChildrenInteractive`/`areNodeChildrenInteractive`
  (the `mouseEnabled`/`mouseChildren` pair), consulted by `findGraphHitTarget`/`hitTestGraphPoint`;
  `hitArea` proxy `setNodeHitArea`/`getNodeHitArea`; cursor `setNodeCursor`/`getNodeCursor` resolved
  on rollover through `CursorBackend`.
- The ledger stored each of these in a **separate package-local `WeakMap`**.

So three of the four axes below are already blessed in principle. This note's new contributions are
(a) **consolidating** them into one cell instead of N WeakMaps, and (b) adding the **focus/tab-order**
axis, which the charter does not mention.

## The four axes — two systems that share a cell

| Axis | Fields | Consumed by | Blessed? |
| --- | --- | --- | --- |
| Pointer hit-gating | `interactive`, `childrenInteractive` | the hit-test walk (`findGraphHitTarget`, `hitTestGraphPoint`) | yes (Approved) |
| Hit-area override | `hitArea` | the hit-test walk | yes (Approved) |
| Cursor | `cursor` | pointer dispatch, on rollover, via `CursorBackend` | yes (Approved; arch Open) |
| **Focus / tab order** | `focusable`, `tabIndex` | a **focus/navigation manager** (keyboard), NOT the pointer path | **new — needs blessing** |

The tell that focus is a *separate system*, not a fifth pointer flag: its consumer is different. The
first three are read by the pointer hit-test walk; focus/tab is data a keyboard navigation manager
walks to build a tab sequence (Flight already has focus managers in `@flighthq/textinput`). They
share the *cell* (one per-node home) without sharing a *flag*.

`buttonMode`/`useHandCursor` (OpenFL) needs no field: it is just `setNodeCursor(node, 'pointer')`.

## Proposed shape

One concept-per-file type in `@flighthq/types` (new `NodeInteractionState.ts`; keep `HitArea` in
`NodeInteraction.ts` and `Cursor` in `Cursor.ts`, referenced here):

Naming decided with the user (2026-07-16): **`hitTest`/`pointer`, never `mouse`** (Flight is
pointer/touch/pen, and the package's existing vocabulary is `hitTest*`). So the gating fields are
`hitTestEnabled`/`hitTestChildren`, not `interactive`/`mouseEnabled`.

```ts
export interface NodeInteractionState {
  hitTestEnabled: boolean;   // self participates in hit testing (the mouseEnabled role)
  hitTestChildren: boolean;  // subtree participates in hit testing (the mouseChildren role)
  hitArea: HitArea | null;   // proxy region/node overriding own geometry; null = own geometry
  cursor: Cursor | null;     // rollover cursor; null = inherit nearest ancestor / none
  focusable: boolean;        // is a keyboard focus target (tab stop)
  tabIndex: number;          // focus order; -1 = not a tab stop / natural order
}
```

**Storage — the main revision to bless.** One lazily-created runtime slot
`NodeRuntime.interactionState: NodeInteractionState | null`, exactly mirroring how
`interactionSignals` and `colorAdjustments` already hang off the runtime (subsystem state on the
narrowest runtime tier, not on the `Node` entity). `null` = all defaults = today's behavior, so it
is **zero bundle/runtime cost until used** and needs no migration. This **supersedes the ledger's
per-property WeakMaps**: one allocation instead of five, one teardown, better locality, and it *is*
the "InteractionState" cell the user asked for. (WeakMaps were the lost impl's choice; the runtime
slot is the house pattern established since.)

**API** (in `@flighthq/interaction`, the owning package):

- `enableNodeInteractionState(node): NodeInteractionState` — lazy-create the slot (mirrors
  `enableInteractionSignals`).
- `getNodeInteractionState(node): NodeInteractionState | null` — raw read, `null` if never set.
- Ergonomic per-field pairs (auto-create on set, default on read): `setNodeHitTestEnabled`/`isNodeHitTestEnabled`,
  `setNodeHitTestChildren`/`hasNodeHitTestChildren`, `setNodeHitArea`/`getNodeHitArea`,
  `setNodeCursor`/`getNodeCursor`, `setNodeFocusable`/`isNodeFocusable`, `setNodeTabIndex`/`getNodeTabIndex`.
- Diagnostics seam (per the inversion rule): `explainNodeHitTest(node, x, y)` returning plain data
  on why a hit did/didn't land (gating / hitArea / clip), in a shakeable guard module.

**Defaults when the slot is absent:** `hitTestEnabled=true`, `hitTestChildren=true`, `hitArea=null`,
`cursor=null`, `focusable=false` (opt-in — a scene node is a tab stop only when asked; see Q2),
`tabIndex=-1`.

## Cursor-on-hit stack (explicit deliverable)

The user wants a working stack where **hovering a node that supports a hit changes the cursor**, not
just a `cursor` field. That is end-to-end:

1. `CursorBackend` seam (exists in `@flighthq/types`) — fix its doc: it currently claims "returns a
   disposer" against a `void setCursor` signature. It is a plain setter; the note keeps it `void`.
2. `createWebCursorBackend(element): CursorBackend` (sets `element.style.cursor`),
   `getCursorBackend()`/`setCursorBackend(backend | null)` — the active-backend install, opt-in so
   headless/native hosts swap it and nothing is patched at import.
3. `setNodeCursor`/`getNodeCursor` on the cell.
4. **Rollover resolution in pointer dispatch:** on rollover-target change, walk the ancestor chain of
   the new target and apply the **innermost non-null `cursor`** through the active backend (falling
   back to `'default'`/`null` when none). This reuses the existing rollover-chain diffing.
5. **Dispatch gating:** run the pointer-move body when signals are needed **OR** a cursor backend is
   active — otherwise a scene with only cursor changes (no move subscribers) would never resolve.

This is the piece that makes "object supports hit → cursor updates" real. It depends only on the
gating/hitArea walk above (to know what the pointer is over) plus the `Cursor` header already present.

**Consumers:**

- `findGraphHitTarget` / `hitTestGraphPoint`: skip self-hit when `!interactive`; skip recursion when
  `!childrenInteractive`; delegate to `hitArea` when set. ~4 lines at the two chokepoints.
- Pointer dispatch rollover: resolve innermost non-null `cursor` up the ancestor chain, apply via the
  active `CursorBackend`.
- A focus/navigation manager (new, or an extension of the textinput focus managers): walks
  `focusable`/`tabIndex` to build the tab sequence. Never touched by the pointer path.

## Decisions (all resolved with the user, 2026-07-16)

1. **Storage:** ✅ **one consolidated runtime-slot cell** (`NodeRuntime.interactionState`), superseding
   the ledger's per-property WeakMaps.
2. **Default `focusable`:** ✅ opt-in (`false`) — explicit tab stops.
3. **Scope this pass:** ✅ **full stack + wire the example** — gating + hitArea + the cursor-on-hit
   stack; focus fields defined in the type, the navigation manager that consumes them deferred.
4. **Naming:** ✅ `hitTest`/`pointer`, never `mouse` — fields `hitTestEnabled`/`hitTestChildren`.
5. **Cursor backend home:** ✅ **per-`InteractionManager`** (`manager.cursorBackend`), not a module
   singleton — this is the multi-canvas-capable shape charter Open direction #1 asked for (one
   manager = one canvas = one cursor zone). `createWebCursorBackend(element)` is a factory the user
   passes to `createInteractionManager`.
```
