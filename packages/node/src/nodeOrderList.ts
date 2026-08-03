import { emitSignal } from '@flighthq/signals/contract';
import type { Node, NodeAny, NodeOrderList, NodeRuntime, NodeTraits } from '@flighthq/types/contract';

import { getNodeRuntime } from './node';

/**
 * Appends one entry to the list's valid window. Capacity past `count` is reused, so a list refilled
 * every frame allocates only while it is growing. A node may be entered more than once; the last entry
 * for it wins, since applyNodeOrderList resolves each node to a single key.
 */
export function addNodeOrderListEntry<Traits extends object = NodeTraits>(
  list: NodeOrderList<Traits>,
  node: Node<Traits>,
  order: number,
): void {
  const count = list.count;
  if (count < list.nodes.length) {
    list.nodes[count] = node;
    list.keys[count] = order;
  } else {
    list.nodes.push(node);
    list.keys.push(order);
  }
  list.count = count + 1;
}

/**
 * Reorders `target`'s children so the list's members sit in ascending key order, and does nothing else.
 * This owns order, never membership: members are permuted among the slots they already occupy, so a
 * child the list does not name never moves, not by one index. Entries that are not currently children
 * of `target` — including ones attached to a different parent — are ignored rather than attached, which
 * makes the call a no-op once the caller has detached every member.
 *
 * Because slots are preserved rather than compacted, a foreign child sitting between two members stays
 * between them; no key moves a member past it. Contiguity comes from parenting, relative order from the
 * list.
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
  if (children === null || list.count === 0) return;

  const listIndex = _listIndex;
  const members = _members;
  const slots = _slots;
  listIndex.clear();
  members.length = 0;
  slots.length = 0;

  for (let i = 0; i < list.count; i++) listIndex.set(list.nodes[i], i);
  for (let i = 0; i < children.length; i++) {
    if (!listIndex.has(children[i])) continue;
    members.push(children[i]);
    slots.push(i);
  }

  // Fewer than two members present cannot be a reordering, whatever their keys say.
  if (members.length < 2) {
    listIndex.clear();
    members.length = 0;
    return;
  }

  const keys = list.keys;
  members.sort((a, b) => {
    const ai = listIndex.get(a) as number;
    const bi = listIndex.get(b) as number;
    // Equal keys keep the order the entries were added in, so a tie is resolved by the list rather than
    // by whatever order the children happened to already be in. Breaking the tie explicitly also frees
    // the C port from needing its sort to be stable.
    return keys[ai] !== keys[bi] ? keys[ai] - keys[bi] : ai - bi;
  });

  let moved = false;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (children[slot] === members[i]) continue;
    children[slot] = members[i] as Node<Traits>;
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
 * `count` keep their node references: the list is a non-owning view, but a long-lived one holds those
 * nodes reachable until it is refilled or itself dropped.
 */
export function clearNodeOrderList<Traits extends object = NodeTraits>(list: NodeOrderList<Traits>): void {
  list.count = 0;
}

export function createNodeOrderList<Traits extends object = NodeTraits>(): NodeOrderList<Traits> {
  return { count: 0, keys: [], nodes: [] };
}

// Scratch reused across applyNodeOrderList calls so a per-frame apply allocates nothing. Cleared on
// every exit path, including before the order-changed signal fires, so a reentrant apply starts clean.
const _listIndex = new Map<NodeAny, number>();
const _members: NodeAny[] = [];
const _slots: number[] = [];
