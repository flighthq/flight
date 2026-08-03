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
interface NodeOrderList {
  nodes: HierarchyNode[];
  keys: number[];
  count: number;
}
```

Two parallel arrays, not an array of records and not a `Map`: zero per-entry allocation, and it lowers
to C as two arrays plus a length.

```ts
const order = createNodeOrderList();
addNodeOrderListEntry(order, node, 5);   // key is a plain number
…
applyNodeOrderList(parent, order);       // sort + diff + minimal moves
clearNodeOrderList(order);               // refill next frame
```

The type lives in `@flighthq/types`; the functions live in a **new module inside
`@flighthq/node`** — no runtime slot, no entity field, still tree-shaken per module. It operates on
`HierarchyNode`, so display objects, sprite graphs, and future graph families all get it.

A plain `number` key covers every consumer: SWF's uint16 depth, skeleton2d's integer slot index, and
Rive's fractional index, where inserting between two neighbors is just a midpoint and renumbering
never happens. Ties break **stably by insertion order** — which the C port must preserve explicitly,
since a stable sort is not the default there.

`applyNodeOrderList` sorts, diffs against the parent's current children, and performs only the moves
that changed, so it never fires the whole-list churn the naive path does.

The "layer" idea needs no machinery: a layer is the high digits of the key.

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

## The open question for the ruling

**Does `applyNodeOrderList` own membership, or only order?**

Recommendation: **only order.** It reorders children that are already attached and ignores list
entries that are not, so the primitive does exactly one thing and is never destructive. SWF then
spells attach and detach itself, which is three explicit passes instead of one implicit one. The
alternative — apply attaches list members and detaches absent children — collapses SWF's frame
construct to a single call, at the cost of a primitive that silently removes nodes.
