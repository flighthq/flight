# Selection Model

_2026-08-27. Architecture record — the selection primitive for editor and interactive applications built on Flight._

**Status: unratified.** Read before working on `selection` or any editor selection feature.

## What it is

`selection` is a new package (`@flighthq/selection`) that provides a selection model over scene graph nodes. It tracks which nodes are selected, supports single and multi-select, provides rubber-band (marquee) and lasso selection, and emits signals on change. It does not render selection visuals — the caller draws selection outlines, handles, and marquee rectangles. The package provides the state and the hit-query logic; the caller provides the visuals and the policy.

## Why a separate package

Selection is not interaction. `interaction` answers "what did the pointer hit?" Selection answers "which nodes are currently chosen for editing, and how does a new pointer gesture modify that set?" The two compose: a pointer-down event goes through `interaction` to find the hit target, then through `selection` to decide whether that target replaces, extends, or toggles the selected set. Keeping them separate means `selection` is usable without `interaction` (programmatic selection), and `interaction` stays focused on dispatch.

Selection is not a GUI controller either. It has no visual parts to wire — it is pure state with query and mutation functions. GUI controllers (gizmos, property inspectors, scene tree views) consume the selection as input.

## Design

### Selection state

A selection state is a plain entity holding an ordered set of selected nodes and the active node (the last one selected, which receives keyboard focus and whose properties are shown in an inspector).

```typescript
const selection = createSelectionState();

// Mutate
selectNode(selection, node);                              // replace selection with one node
addNodeToSelection(selection, node);                      // add without clearing (Ctrl+click)
removeNodeFromSelection(selection, node);                 // remove one (Ctrl+click on selected)
toggleNodeSelection(selection, node);                     // add if absent, remove if present
clearSelection(selection);                                // deselect all
selectAllNodes(selection, candidates);                    // select all from a provided list

// Query
getSelectedNodes(selection): readonly Node2D[];           // ordered set
getActiveNode(selection): Node2D | null;                  // last selected
isNodeSelected(selection, node): boolean;
getSelectionCount(selection): number;
hasSelection(selection): boolean;

// Signals
getSelectionSignals(selection).onChange                    // Signal<(selected: readonly Node2D[]) => void>
getSelectionSignals(selection).onActiveChange             // Signal<(active: Node2D | null) => void>
```

### Pointer-to-selection policy

The package provides a policy function that interprets a pointer event + modifier keys into a selection mutation. This encodes the standard platform conventions:

```typescript
applyPointerSelectionPolicy(selection, hit, modifiers): void
```

Where `modifiers` carries `shift`, `ctrl`/`cmd`, and `alt` flags. The policy:

| Modifier | Hit an unselected node | Hit a selected node | Hit empty space |
|----------|----------------------|--------------------|--------------------|
| None | Select (replace) | No change (drag starts) | Clear selection |
| Shift | Add to selection | Remove from selection | No change |
| Ctrl/Cmd | Toggle | Toggle | No change |

This is a standard convention (Photoshop, Illustrator, Unity, Blender). The caller can bypass the policy and call the mutation functions directly for custom behavior.

On pointer-up after no drag with no modifier on an already-selected node: narrow selection to that node. This handles the click-to-select-one-from-group case without interfering with drag-to-move-selection.

### Marquee (rubber-band) selection

```typescript
const marquee = createMarqueeSelection();

// Call during a pointer drag gesture
beginMarqueeSelection(marquee, startX, startY);
updateMarqueeSelection(marquee, currentX, currentY);
endMarqueeSelection(marquee): Rectangle;

// Query which nodes fall within the marquee
getMarqueeRectangle(marquee): Readonly<Rectangle>;
findNodesInMarqueeSelection(marquee, candidates, mode): Node2D[];
```

The `mode` parameter controls containment:

- `'intersect'` — any node whose bounds overlap the rectangle (the default, matches most editors)
- `'contain'` — only nodes fully inside the rectangle

The function returns the candidate nodes that match. The caller then calls `selectNode` / `addNodeToSelection` to apply the result to the selection state — the marquee finder does not mutate selection directly, so the caller controls whether marquee replaces or extends.

The marquee visual (the dashed rectangle overlay) is the caller's responsibility — the package provides the rectangle coordinates.

### Lasso selection

```typescript
const lasso = createLassoSelection();

beginLassoSelection(lasso, startX, startY);
addLassoSelectionPoint(lasso, x, y);
endLassoSelection(lasso): Path;

findNodesInLassoSelection(lasso, candidates): Node2D[];
```

The lasso builds a closed path from pointer positions and tests candidate node positions (or bounds centers) against the path winding. The lasso visual (the freeform outline) is the caller's responsibility.

### Group selection and hierarchy

Selection operates on the nodes the caller provides as candidates. The caller decides the selectable set — typically the direct children of the scene root, or a filtered subset. This means:

- Selecting a group (container) selects the group, not its children.
- Double-clicking into a group to select a child is a policy the caller implements by narrowing the candidate set.
- Locked/hidden nodes are excluded by the caller when building the candidate list.

The package does not enforce hierarchy policy — it provides the selection state and the geometric queries. The editor decides which nodes are eligible.

## Dependencies

- `geometry` — rectangle intersection, point-in-polygon for lasso
- `node` — bounds queries for hit testing candidates
- `signals` — change notification
- `types` — all type definitions

Does not depend on: `interaction`, `gui`, `render`, `scene2d`, `scene3d`, `tween`.

## Scope boundaries

**In scope**: selection state (ordered set + active node), pointer-to-selection policy, marquee selection, lasso selection, geometric candidate queries, signals.

**Out of scope**: selection visuals (outlines, handles, marquee rectangle rendering), transform gizmos (see `gizmo`), drag-to-move (the caller implements move using the selected set + pointer delta), clipboard operations (copy/paste use `clipboard` + `scene-document`), scene tree selection synchronization (the tree view controller in `gui` listens to selection signals).

---

# Manager rulings — PRESERVED VERBATIM after a records collision, 2026-08-28

★ **Why this section exists.** A records rewrite built from a base that predated these rulings landed and
dropped every ruling section below. The code still implements them and tests pin several, but the
*reasoning* was lost while the conclusions survived — and the reasoning is the part that stops a future
agent re-deriving a decision that was already withdrawn.

Reproduced **verbatim** rather than re-summarised, because summarising a ruling is exactly how this was
lost the first time. Where a ruling is already pinned by a test, the test is the enforcement and this is
the explanation. Where anything here conflicts with the sections above, the *conclusions* above are
current wherever the user has since ruled; this is what those conclusions were built on.

## Manager rulings — 2026-08-27

**Deliverable ruled by the user: THE PACKAGES ONLY.** `gui`, `selection`, `gizmo` and `command` are built
as SDK cells to AAA completeness, each usable standalone by anyone building an editor or tool. **No
editor application ships from this work.** The "editor data flow" in the handoff is motivation, not a
deliverable — do not let an app shell, panel layout, project model, or file management appear in any of
these packages. An editor is a possible follow-on the user will scope separately.

**Sequencing ruled by the user: PARALLEL with `scene-document`.** `selection` and `command` depend only
on `node`, `signals`, `geometry` and `types` and touch nothing `scene-document` touches, so they start
immediately. `gui` needs `interaction`, which exists. Only `gizmo` has real coupling, through the
overlay scene.

**S1. The package and its boundary — APPROVED.** Selection is not interaction and not a GUI
controller; the record draws both lines correctly.

**S2. TYPE IT ON GRAPH-FEATURE ALIASES, NOT `Node2D`.** Every signature in this record is written
against `Node2D`. Standing rule: use the graph-feature aliases so an API depends on the feature it
needs rather than on a concrete graph family. Selection needs node identity and hierarchy — it does not
need 2D-ness, and `gizmo` already declares a 3D extension, so `Node2D` here means rewriting every
signature later instead of never.

Ruling: the selected set is over **`HierarchyNode`**. The marquee and lasso queries additionally need
bounds, so they take **`BoundsNode`** — state it at that seam rather than widening the whole package to
the union of everything any one function wants.

