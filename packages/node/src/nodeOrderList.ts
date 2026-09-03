import { createEntity } from '@flighthq/entity/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  Node,
  NodeAny,
  NodeOf,
  NodeOrderList,
  NodeOrderListEntryVisitor,
  NodeRuntime,
  NodeTraits,
} from '@flighthq/types/contract';

import { getNodeRuntime } from './node';

/**
 * Appends one entry to the list's valid window. Capacity past `entryCount` is reused, so a list
 * refilled every frame allocates only while it is growing. This does not check whether `node` is
 * already entered — it is the O(1) bulk-fill verb. Use setNodeOrderListEntry to re-key a node that may
 * already be present; a node entered twice resolves to its last entry.
 */
export function addNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  sortKey: number,
): void {
  const entryCount = list.entryCount;
  if (entryCount < list.nodes.length) {
    list.nodes[entryCount] = node;
    list.sortKeys[entryCount] = sortKey;
  } else {
    list.nodes.push(node);
    list.sortKeys.push(sortKey);
  }
  list.entryCount = entryCount + 1;
}

/**
 * Reorders `target`'s children so the list's members sit in ascending sort-key order, and does nothing
 * else. This owns order, never membership: members are permuted among the slots they already occupy, so
 * a child the list does not name never moves, not by one index. Entries that are not currently children
 * of `target` — including ones attached to a different parent — are ignored rather than attached, which
 * makes the call a no-op once the caller has detached every member.
 *
 * Because slots are preserved rather than compacted, a foreign child sitting between two members stays
 * between them; no sort key moves a member past it. Contiguity comes from parenting, relative order
 * from the list.
 *
 * Children are written in place rather than routed through setNodeChildIndex: every member is already a
 * child of `target`, so no parent pointer or parentReferenceId changes, and the whole permutation stamps
 * `childrenId` once instead of once per moved node.
 */
export function applyNodeOrderList<Traits extends object = NodeTraits>(
  target: Node<Traits>,
  list: Readonly<NodeOrderList<Traits>>,
): void {
  const targetRuntime = getNodeRuntime(target) as NodeRuntime<Traits>;
  const children = targetRuntime.children;
  if (children === null || list.entryCount === 0) return;

  const listIndex = _listIndex;
  const members = _members;
  const slots = _slots;
  listIndex.clear();
  members.length = 0;
  slots.length = 0;

  // A node entered more than once resolves to its last entry, since the later set overwrites.
  for (let i = 0; i < list.entryCount; i++) listIndex.set(list.nodes[i], i);
  for (let i = 0; i < children.length; i++) {
    if (!listIndex.has(children[i])) continue;
    members.push(children[i]);
    slots.push(i);
  }

  // Fewer than two members present cannot be a reordering, whatever their sort keys say.
  if (members.length < 2) {
    listIndex.clear();
    members.length = 0;
    return;
  }

  const sortKeys = list.sortKeys;
  members.sort((a, b) => {
    const ai = listIndex.get(a) as number;
    const bi = listIndex.get(b) as number;
    // Equal sort keys keep the order the entries were added in, so a tie is resolved by the list rather
    // than by whatever order the children happened to already be in. Breaking the tie explicitly also
    // frees the C port from needing its sort to be stable, and it is the mechanism the *Above/*Below
    // verbs place with — they assign an equal key and rely on entry position to separate the two.
    return sortKeys[ai] !== sortKeys[bi] ? sortKeys[ai] - sortKeys[bi] : ai - bi;
  });

  let moved = false;
  // `members` and `slots` have exactly the same length: every append and every reset above changes them
  // as a pair. The equality check consequently makes a trailing iteration inert too — both lookups are
  // `undefined` and it continues without writing. If those paired writes ever diverge, re-examine this
  // loop boundary rather than relying on that equivalence.
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (children[slot] === members[i]) continue;
    children[slot] = members[i] as NodeOf<Traits>;
    moved = true;
  }

  // Released before the signal, so a handler that applies another list is not reading this call's
  // scratch out from under it.
  listIndex.clear();
  members.length = 0;

  if (!moved) return;
  targetRuntime.childrenId = (targetRuntime.childrenId + 1) >>> 0;
  const targetSignals = targetRuntime.nodeSignals;
  if (targetSignals !== null) emitSignal(targetSignals.onChildrenOrderChanged);
}

/**
 * Empties the valid window without releasing capacity, so the next fill reuses the arrays. Entries past
 * `entryCount` keep their node references; use disposeNodeOrderList to drop them.
 */
export function clearNodeOrderList<Traits extends object = NodeTraits>(list: NodeOrderList<Traits>): void {
  list.entryCount = 0;
}

export function createNodeOrderList<Traits extends object = NodeTraits>(): NodeOrderList<Traits> {
  return createEntity({ entryCount: 0, nodes: [], sortKeys: [] });
}

/**
 * Empties the list and releases its node references, so a long-lived list stops holding nodes reachable.
 * The list stays usable; this is the teardown counterpart to clearNodeOrderList, which deliberately
 * retains both capacity and the references past the window for reuse.
 */
export function disposeNodeOrderList<Traits extends object = NodeTraits>(list: NodeOrderList<Traits>): void {
  list.entryCount = 0;
  list.nodes.length = 0;
  list.sortKeys.length = 0;
}

/**
 * Calls `callback` for each entry in the order the entries were added, which is not the order they
 * resolve to. Stops early if `callback` returns `false`.
 */
export function forEachNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: Readonly<NodeOrderList<Traits>>,
  callback: NodeOrderListEntryVisitor<Traits>,
): void {
  for (let i = 0; i < list.entryCount; i++) {
    if (callback(list.nodes[i], list.sortKeys[i], i) === false) return;
  }
}

/**
 * Returns the sort key `node` is entered with, or `null` when it has no entry. Null rather than -1
 * because every finite number, negative included, is a legal sort key.
 */
export function getNodeOrderListEntrySortKey<Traits extends object = NodeTraits>(
  list: Readonly<NodeOrderList<Traits>>,
  node: Readonly<Node<Traits>>,
): number | null {
  const index = findNodeOrderListEntryIndex(list, node);
  return index === -1 ? null : list.sortKeys[index];
}

export function hasNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: Readonly<NodeOrderList<Traits>>,
  node: Readonly<Node<Traits>>,
): boolean {
  return findNodeOrderListEntryIndex(list, node) !== -1;
}

/**
 * Removes `node`'s entry, returning whether one was found. Entries after it shift down rather than
 * being back-filled from the end: entry position breaks ties between equal sort keys, so preserving it
 * is part of the contract, not an implementation detail.
 */
export function removeNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Readonly<Node<Traits>>,
): boolean {
  const index = findNodeOrderListEntryIndex(list, node);
  if (index === -1) return false;
  removeNodeOrderListEntryAtIndex(list, index);
  return true;
}

/**
 * Enters `node` at `sortKey`, replacing its existing entry in place if it has one. This is the verb for
 * incremental re-keying: unlike addNodeOrderListEntry it never grows the list with a second entry for
 * the same node, at the cost of a scan.
 */
export function setNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  sortKey: number,
): void {
  const index = findNodeOrderListEntryIndex(list, node);
  if (index === -1) {
    addNodeOrderListEntry(list, node, sortKey);
    return;
  }
  list.sortKeys[index] = sortKey;
}

/**
 * Enters `node` so it resolves immediately above `target` — drawn after it, in front of it. Does
 * nothing when `target` has no entry, since there is nothing to be above.
 *
 * Placement is exact rather than a midpoint between neighbouring keys: `node` takes `target`'s own sort
 * key and its entry is positioned just after `target`'s, so the equal-key tie-break separates the two.
 * That holds however tightly packed the surrounding keys are, and repeated placement never exhausts
 * float precision the way bisection does.
 */
export function setNodeOrderListEntryAbove<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  target: Readonly<Node<Traits>>,
): void {
  insertNodeOrderListEntryBeside(list, node, target, 1);
}

/**
 * Enters `node` so it resolves immediately below `target` — drawn before it, behind it. Does nothing
 * when `target` has no entry. The mirror of setNodeOrderListEntryAbove, placing `node`'s entry just
 * before `target`'s at the same sort key.
 */
export function setNodeOrderListEntryBelow<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  target: Readonly<Node<Traits>>,
): void {
  insertNodeOrderListEntryBeside(list, node, target, 0);
}

/**
 * Refills the list from `source`'s current children, each entered at its own child index. This is the
 * inverse of applyNodeOrderList: capture what is there, edit it with the *Above/*Below/swap verbs, then
 * apply it back. Any previous contents are discarded.
 */
export function setNodeOrderListFromNodeChildren<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  source: Readonly<Node<Traits>>,
): void {
  list.entryCount = 0;
  const children = getNodeRuntime(source).children;
  if (children === null) return;
  for (let i = 0; i < children.length; i++) {
    addNodeOrderListEntry(list, children[i], i);
  }
}

/**
 * Exchanges the sort keys of two entered nodes, the way a display list swaps two depths. Does nothing
 * unless both nodes have entries. Entry positions are left alone, so a tie between the two resolves the
 * same way afterwards as before.
 */
export function swapNodeOrderListEntries<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  nodeA: Readonly<Node<Traits>>,
  nodeB: Readonly<Node<Traits>>,
): void {
  const indexA = findNodeOrderListEntryIndex(list, nodeA);
  if (indexA === -1) return;
  const indexB = findNodeOrderListEntryIndex(list, nodeB);
  if (indexB === -1) return;
  const sortKeyA = list.sortKeys[indexA];
  list.sortKeys[indexA] = list.sortKeys[indexB];
  list.sortKeys[indexB] = sortKeyA;
}

function findNodeOrderListEntryIndex<Traits extends object>(
  list: Readonly<NodeOrderList<Traits>>,
  node: Readonly<Node<Traits>>,
): number {
  // Scans backwards so a node entered more than once reports the entry that wins at apply time.
  for (let i = list.entryCount - 1; i >= 0; i--) {
    if (list.nodes[i] === node) return i;
  }
  return -1;
}

// Shared by the Above (offset 1) and Below (offset 0) verbs: `node` takes `target`'s sort key and its
// entry lands on the named side of `target`'s. An existing entry for `node` is removed first, so
// re-placing a node already in the list moves it rather than duplicating it.
function insertNodeOrderListEntryBeside<Traits extends object>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  target: Readonly<Node<Traits>>,
  offset: number,
): void {
  if (node === target) return;
  if (findNodeOrderListEntryIndex(list, target) === -1) return;
  const existing = findNodeOrderListEntryIndex(list, node);
  if (existing !== -1) removeNodeOrderListEntryAtIndex(list, existing);
  const targetIndex = findNodeOrderListEntryIndex(list, target);
  const sortKey = list.sortKeys[targetIndex];
  const at = targetIndex + offset;
  addNodeOrderListEntry(list, node, sortKey);
  // The assignments after this loop author `at` without reading it, so an additional iteration at
  // `i === at` would only copy into a slot that is immediately overwritten. If those final assignments
  // move, become conditional, or gain an intervening read, re-examine the strict loop boundary.
  for (let i = list.entryCount - 1; i > at; i--) {
    list.nodes[i] = list.nodes[i - 1];
    list.sortKeys[i] = list.sortKeys[i - 1];
  }
  list.nodes[at] = node;
  list.sortKeys[at] = sortKey;
}

function removeNodeOrderListEntryAtIndex<Traits extends object>(list: NodeOrderList<Traits>, index: number): void {
  const last = list.entryCount - 1;
  for (let i = index; i < last; i++) {
    list.nodes[i] = list.nodes[i + 1];
    list.sortKeys[i] = list.sortKeys[i + 1];
  }
  list.entryCount = last;
}

// Scratch reused across applyNodeOrderList calls so a per-frame apply allocates nothing. Cleared on
// every exit path, including before the order-changed signal fires, so a reentrant apply starts clean.
const _listIndex = new Map<NodeAny, number>();
const _members: NodeAny[] = [];
const _slots: number[] = [];
