# Draw Order Model — child order is the only order

**Status: PROPOSAL, not implemented.** Written by principal with the user on 2026-08-03, from the
question "should SWF and Rive import benefit from a z-index rather than parenting?". The user ruled on
the three shape questions (representation, home, name) in that session; the model itself awaits
approval before dispatch.

Read this before adding an ordering field to a node, before giving a format importer its own child
reordering pass, and before deciding where a draw-order timeline binds.

## The question

Two authoring formats look like they want an ordering axis the scene graph does not have. They are not
the same problem, and treating them as one is how this gets designed badly.

**SWF depth is not a second axis.** Depth is a sparse integer key *within one container's display
list* — a total order under a single parent, isomorphic to child index. The importer already knows
this: it sorts placements by depth and materializes that as child order
(`packages/swf/src/swfDocument.ts:401`, `:635`), and it resolves `clipDepth` range-masks into a
per-node `ClipRegion` at import (`:571-600`) rather than reparenting.

**Rive genuinely has two orders.** Default draw order is the hierarchy, but Draw Rules override it
during animation — "draw above/below this target drawable", animatable, resolved by the artboard into
a linked draw list. Rive can afford that because in its model only leaves draw: groups are
transform-only and clipping is per-drawable, so there is no group compositing to break.

Flight is not in Rive's position, which is why the answer is not Rive's answer.

## Where the code stands

- No `zIndex`, `sortableChildren`, or draw-order field exists in any package. Draw order is pre-order
  child-array order (`packages/render/src/renderQueue.ts:21-47`).
- The hierarchy already carries the ordered-insert surface — `addNodeChildAt`, `setNodeChildIndex`,
  `swapNodeChildren` — plus `childrenId` invalidation (`packages/types/src/Node.ts:30`) and an
  `onChildrenOrderChanged` signal.
- A render-time reorder seam already exists: `sortRenderQueue(queue, compare?)` over
  `packRenderSortKey(layer, depth, isTransparent)` (`renderQueue.ts:74`, `:97`). The 3D transparent
  pass uses it.
- The DOM backend stacks by real DOM sibling order, physically reordering elements each frame
  (`packages/scene2d-dom/src/domReconcile.ts:66-70`).

## Four rejected shapes, and why

**A `zIndex` field on the node.** This is the anti-goal shape — a property the runtime quietly acts on
at render time, the same family as `displayObject.filters`. It creates two sources of truth for order,
and every consumer must honor both: the queue build, the clip stack, DOM reconcile, and
`interaction`'s reverse-order hit test. It also buys SWF nothing, because per-parent depth ordering
*is* child index.

**Draw order decoupled from the tree.** Contiguity is not incidental here: group alpha, blend, the
strictly-nested clip push/pop, and offscreen effect passes all assume a subtree draws as one
contiguous run. The DOM backend cannot express a cross-parent order at all — every node carries a
transform, so it is a stacking context, and no z-index lifts a child above a sibling's subtree.
Decoupled order would be permanently backend-divergent.

**Ordering as a node kind (an `OrderedGroup` / `Layer`).** All three consumers have a container that is
already a kind: SWF's timeline target is a `MovieClip` (`swfDocument.ts:381`), Rive's is an artboard
root, skeleton2d's is a skeleton node. As a kind, each either *becomes* that kind — reopening the
hierarchy-family question — or gets a synthetic ordered container inserted between the clip and its
contents, which is reparenting, the move this whole design exists to avoid. It would also break
`getNodeChildAt(clip, 0)` addressing and the `Scene2DDocument` slot lookups that resolve against the
clip's real children.

**Order stored on the parent's runtime slot.** A stored order is an invariant that every other
hierarchy verb can silently violate — `addNodeChild`, `addNodeChildAt`, `setNodeChildIndex`,
`swapNodeChildren`. Defending it needs a guard, and a guard for "you used the wrong door" means the
door should not have been there.

## The model: a caller-owned `NodeOrderList`

Ordering is a **plain value the caller owns**, not state the graph carries. There is no invariant for
the graph to defend: the graph stays a graph, and the ordering is a statement the caller makes when it
chooses to make it. The list is a reusable buffer — cleared and refilled per frame rather than
allocated per frame — following the `entries` / `entryCount` window pattern `RenderQueue` already uses
(`renderQueue.ts:62`, `:83`).

Parenting is unchanged, and ordering is strictly **within one parent**. A key never moves a node
between parents, which is what keeps subtree contiguity, group compositing, clip nesting, and DOM
sibling reconcile all working untouched.

```ts
interface NodeOrderList<Traits extends object = NodeTraits> {
  entryCount: number;
  nodes: Node<Traits>[];
  sortKeys: number[];
}
```

Two parallel arrays, not an array of records and not a `Map`: zero per-entry allocation, and it lowers
to C as two arrays plus a length. `entryCount` is the valid window, matching `RenderQueue`'s
`entries` / `entryCount` buffer pattern.

**Vocabulary.** The list defines an *order*; each *entry* carries a *sort key*. An item does not have
an order — it has a place in one — which is why the per-entry field is not `orders`. `sortKey` reuses
the word `RenderQueueEntry.sortKey` and `RenderSortKey` already carry for the identical concept one
layer over. It is deliberately **not** `depths`: every one of the 14 `depth` fields in
`@flighthq/types` is the Z/depth buffer, and Flight — unlike Flash — has a 3D half where that is the
real meaning.

The type lives in `@flighthq/types`; the functions live in a **module inside `@flighthq/node`** — no
runtime slot, no entity field, still tree-shaken per module. It is generic over `Node<Traits>`, so
display objects, sprite graphs, and future graph families all get it.

A plain `number` sort key covers every consumer: SWF's uint16 depth, skeleton2d's integer slot index,
and Rive's draw order. Ties break **by entry position** — resolved with an explicit index comparison
rather than by relying on the sort being stable, which also frees the C port from needing a stable
sort.

`applyNodeOrderList` sorts, diffs against the parent's current children, and performs only the moves
that changed, so it never fires the whole-list churn the naive path does.

The "layer" idea needs no machinery: a layer is the high digits of the sort key.

### The surface

Bulk fill is `addNodeOrderListEntry` (O(1) append, no duplicate check); incremental editing is
`setNodeOrderListEntry` (upsert), `removeNodeOrderListEntry`, and `swapNodeOrderListEntries` — the
last being what a display list has always called swapping two depths. Queries are
`hasNodeOrderListEntry`, `getNodeOrderListEntrySortKey` (`null`, not `-1`, since every finite number
is a legal key), and `forEachNodeOrderListEntry`. `setNodeOrderListFromNodeChildren` captures a
parent's current child order as keys — the inverse of apply, and what makes "reorder relative to what
is already there" expressible at all. `clearNodeOrderList` empties the window and keeps capacity;
`disposeNodeOrderList` also drops the node references, per the dispose/destroy rule.

### Relative placement without fractional indices

`setNodeOrderListEntryAbove` / `Below` place a node beside a target. They do **not** bisect between
neighbouring keys. The node takes the target's *own* sort key and its entry is positioned adjacent to
the target's, so the equal-key tie-break separates the two.

This is exact where bisection is approximate: it works when neighbouring keys leave no gap at all
(5 and 6), and repeated placement never exhausts float precision, which is why Rive's runtime needs a
fractional index and Flight does not. Removal shifts the remaining entries down rather than
back-filling from the end for the same reason — entry position is load-bearing, not incidental.

## What this deliberately does not do

The graph does not remember. After an apply, a later `addNodeChild` drifts the order until the caller
re-applies, and there is no `getNodeChildOrder(parent, child)` to query. That is the trade — a
defended invariant plus guard surface, versus a plain value the caller re-applies — and the second is
in character for Flight. All three consumers own their list and re-apply on the frames that change,
and a user moving one sprite behind another is already served by `setNodeChildIndex`.

## Consumers

**SWF.** `constructFrame` currently detaches and re-attaches the *entire* child list on any order
change (`swfDocument.ts:508-517`), so one mid-list insertion rebuilds everything and fires
order-changed for every sibling. It becomes: attach newly placed instances, detach the ones this frame
does not place, then one `applyNodeOrderList` with depth as the key. The depth→placement map the
parser already builds (`:1080`) feeds the list directly.

**Rive.** A Draw Rule is a topological constraint over the artboard's drawable list. Resolve the
constraint set per keyframe into a per-parent key and feed the same list. Where a rule moves a
drawable out of its parent's contiguous run *and* that parent needs group compositing, that is a
genuine conflict — report it through `importdiagnostics` as fidelity loss rather than bending the
graph. In practice, limb-swap rules keep their targets under a common ancestor.

**skeleton2d.** The slot draw-order timeline that
[skeleton2d animation model](skeleton2d-animation-model.md) deliberately leaves open binds here: a
draw-order channel samples to slot keys and applies one list.

## Apply owns order, never membership

Ruled by the user, 2026-08-03. `applyNodeOrderList` reorders children that are already attached and
ignores list entries that are not. It never attaches and never detaches, so the primitive does exactly
one thing and is never destructive. SWF spells its attach and detach passes itself.

### The rule: a slot-preserving permutation

The list permutes its members among **the slots they already occupy**. Nothing else moves.

```
applyNodeOrderList(parent, list):
  1. one pass over parent's children, recording the index of each child that is a
     member of the list — that ascending index sequence is the slots
  2. sort the members that were found, by key (stable; ties by insertion order)
  3. write them back into those same slots, in sorted order
```

Foreign children never move, not by one index. Members not attached to `parent` — including members
attached to a *different* parent — are ignored. `childrenId` is bumped once if anything moved, not per
move.

One rule covers every edge case with no special case:

- Some members removed by the caller → the slot set is smaller; the survivors still sort correctly
  relative to each other.
- **All** members removed → the slot set is empty and apply is a no-op. Nothing resurrects, nothing
  throws.
- A foreign child added in the middle → it stays where the caller put it; members sort around it.
- A member manually moved with `setNodeChildIndex` → the next apply puts it back, because the list is
  the statement of record *for its own members*. Scoped to members, so it cannot stomp anything the
  caller did not hand it.
- Applied twice → idempotent by construction.

Cost is one pass over the children plus a sort of the member subset: `O(n + m log m)`.

Per the diagnostics rule, the ignored-entry case is a silent sentinel and gets a shakeable
`explainNodeOrderList(parent, list)` returning plain data — which entries were not children of this
parent — rather than a warning in the hot path, since a persistent list legitimately carries off-frame
members.

### The boundary: contiguity is not promised

Slot preservation means a foreign child sitting between two members stays between them; no key value
moves a member past it. That is correct — we promised not to move foreign children — but it is the
edge of what the list offers. **Parenting gives contiguity; the list gives relative order within it.**
A caller who wants an ordered group to draw as one block puts it under its own container.

A free consequence: two independent lists can share one parent (a SWF timeline list and a skeleton2d
slot list) with no key-space convention, because each permutes only its own slots.

## What Flash did, and why we are not doing it

Worth recording, because both Flash answers are the ones this rule replaces.

**AVM1 partitioned the key space.** Depths ran −16384 to 1048575: −16383..−1 reserved for author-time
timeline content, ≥0 for script content via `attachMovie` / `createEmptyMovieClip`, and −16384 the
single slot for dynamic content beneath everything. Timeline and script never collided because they
were handed disjoint ranges by convention. The slot rule gets that coexistence structurally instead,
because "my members" is a real set rather than a range agreement.

**AVM2 hid depth and did not solve it.** `DisplayObjectContainer` became dense indices with the sparse
timeline list kept private, which produced the well-known defect: returning to a keyframe makes the
timeline re-assert its placement, so a script-moved instance is both where the script put it and
re-added by the timeline. Adobe's guidance was to not mix the two. Our re-assert is bounded to list
members, which is what keeps it from becoming that bug.
