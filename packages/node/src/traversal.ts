import type { Node, NodeDescendantVisitor, NodeOf, NodeTraits } from '@flighthq/types';

import { getNodeParent } from './hierarchy';
import { getNodeRuntime } from './node';

/**
 * Finds the first descendant of `source` (depth-first pre-order) that satisfies `predicate`.
 * Returns `null` if no descendant matches.
 */
export function findNode<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
  predicate: (node: Node<Traits>) => boolean,
): NodeOf<Traits> | null {
  const children = getNodeRuntime(source).children;
  if (children === null) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Node<Traits>;
    if (predicate(child)) return child as NodeOf<Traits>;
    const found = findNode(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Finds the first descendant of `source` (depth-first pre-order) with the given `name`. Searches
 * the full subtree recursively, unlike `getNodeChildByName` which only checks direct children.
 * Returns `null` if no descendant matches.
 */
export function findNodeByName<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
  name: string,
): NodeOf<Traits> | null {
  return findNode(source, (node) => node.name === name);
}

/**
 * Walks upward from `source` toward the root, calling `callback` for each ancestor. If `callback`
 * returns `false`, the walk stops early. The source node itself is not visited.
 */
export function forEachNodeAncestor<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
  callback: (node: Node<Traits>) => boolean,
): void {
  let current = getNodeParent(source as Node<Traits>);
  while (current !== null) {
    if (!callback(current)) return;
    current = getNodeParent(current);
  }
}

/**
 * Calls `callback` for every descendant of `source` in depth-first pre-order. Unlike
 * `walkNodeDescendants`, this variant never stops early — every descendant is visited regardless
 * of the callback's return value.
 */
export function forEachNodeDescendant<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
  callback: (node: Node<Traits>) => void,
): void {
  const children = getNodeRuntime(source).children;
  if (children === null) return;
  for (let i = 0; i < children.length; i++) {
    callback(children[i] as Node<Traits>);
    forEachNodeDescendant(children[i] as Node<Traits>, callback);
  }
}

/**
 * Returns a read-only snapshot of the direct children of `source`. Returns an empty array if the
 * node has no children. The returned array is a copy and safe to iterate while the graph mutates.
 */
export function getNodeChildren<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
): readonly NodeOf<Traits>[] {
  const children = getNodeRuntime(source).children;
  if (children === null) return _emptyChildren as readonly NodeOf<Traits>[];
  return children.slice() as NodeOf<Traits>[];
}

/**
 * Returns the depth of `source` in the tree: 0 for a root node (no parent), 1 for a direct child
 * of the root, and so on.
 */
export function getNodeDepth<Traits extends object = NodeTraits>(source: Readonly<Node<Traits>>): number {
  let depth = 0;
  let current = getNodeParent(source as Node<Traits>);
  while (current !== null) {
    depth++;
    current = getNodeParent(current);
  }
  return depth;
}

/**
 * Returns the next sibling of `source` (the child immediately after it in its parent's children
 * array), or `null` if `source` is the last child or has no parent.
 */
export function getNodeNextSibling<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
): NodeOf<Traits> | null {
  const parent = getNodeParent(source as Node<Traits>);
  if (parent === null) return null;
  const siblings = getNodeRuntime(parent).children;
  if (siblings === null) return null;
  const idx = siblings.indexOf(source as Node<Traits>);
  if (idx === -1 || idx === siblings.length - 1) return null;
  return siblings[idx + 1] as NodeOf<Traits>;
}

/**
 * Returns the previous sibling of `source` (the child immediately before it in its parent's
 * children array), or `null` if `source` is the first child or has no parent.
 */
export function getNodePreviousSibling<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
): NodeOf<Traits> | null {
  const parent = getNodeParent(source as Node<Traits>);
  if (parent === null) return null;
  const siblings = getNodeRuntime(parent).children;
  if (siblings === null) return null;
  const idx = siblings.indexOf(source as Node<Traits>);
  if (idx <= 0) return null;
  return siblings[idx - 1] as NodeOf<Traits>;
}

/**
 * Walks the descendants of `source` in depth-first pre-order, calling `visit` for each node.
 * If `visit` returns `false`, the walk stops early (neither the current node's subtree nor any
 * remaining siblings are visited). Returns `true` if the walk completed without early termination,
 * `false` if it was cut short.
 */
export function walkNodeDescendants<Traits extends object = NodeTraits>(
  source: Readonly<Node<Traits>>,
  visit: NodeDescendantVisitor<Traits>,
): boolean {
  const children = getNodeRuntime(source).children;
  if (children === null) return true;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Node<Traits>;
    if (!visit(child)) return false;
    if (!walkNodeDescendants(child, visit)) return false;
  }
  return true;
}

const _emptyChildren: readonly never[] = [];
