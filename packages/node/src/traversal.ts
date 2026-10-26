import type { Node, NodeDescendantVisitor, NodeOf, NodeFields } from '@flighthq/types/contract';

import { getNodeParent } from './hierarchy.ts';
import { getNodeRuntime } from './node.ts';

/**
 * Finds the first descendant of `source` (depth-first pre-order) that satisfies `predicate`.
 * Returns `null` if no descendant matches. When `predicate` is a type guard, the result is
 * narrowed to the guarded type, so `findNode(root, isMesh)` returns `Mesh | null` with no cast.
 */
export function findNode<Fields extends object, Result extends Node<Fields>>(
  source: Readonly<Node<Fields>>,
  predicate: (node: Node<Fields>) => node is Result,
): Result | null;
export function findNode<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  predicate: (node: Node<Fields>) => boolean,
): NodeOf<Fields> | null;
export function findNode<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  predicate: (node: Node<Fields>) => boolean,
): NodeOf<Fields> | null {
  const children = getNodeRuntime(source).children;
  if (children === null) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (predicate(child)) return child;
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
export function findNodeByName<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  name: string,
): NodeOf<Fields> | null {
  return findNode(source, (node) => node.name === name);
}

/**
 * Walks upward from `source` toward the root, calling `callback` for each ancestor. If `callback`
 * returns `false`, the walk stops early. The source node itself is not visited.
 */
export function forEachNodeAncestor<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  callback: (node: Node<Fields>) => boolean | void,
): void {
  let current = getNodeParent(source as Node<Fields>);
  while (current !== null) {
    if (callback(current) === false) return;
    current = getNodeParent(current);
  }
}

/**
 * Calls `callback` for every descendant of `source` in depth-first pre-order. Unlike
 * `walkNodeDescendants`, this variant never stops early — every descendant is visited regardless
 * of the callback's return value.
 */
export function forEachNodeDescendant<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  callback: (node: Node<Fields>) => void,
): void {
  const children = getNodeRuntime(source).children;
  if (children === null) return;
  for (let i = 0; i < children.length; i++) {
    callback(children[i]);
    forEachNodeDescendant(children[i], callback);
  }
}

/**
 * Returns a read-only snapshot of the direct children of `source`. Returns an empty array if the
 * node has no children. The returned array is a copy and safe to iterate while the graph mutates.
 */
export function getNodeChildren<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
): readonly NodeOf<Fields>[] {
  const children = getNodeRuntime(source).children;
  if (children === null) return _emptyChildren as readonly NodeOf<Fields>[];
  return children.slice();
}

/**
 * Returns the depth of `source` in the tree: 0 for a root node (no parent), 1 for a direct child
 * of the root, and so on.
 */
export function getNodeDepth<Fields extends object = NodeFields>(source: Readonly<Node<Fields>>): number {
  let depth = 0;
  let current = getNodeParent(source as Node<Fields>);
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
export function getNodeNextSibling<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
): NodeOf<Fields> | null {
  const sourceNode = source as NodeOf<Fields>;
  const parent = getNodeParent(sourceNode);
  if (parent === null) return null;
  const siblings = getNodeRuntime(parent).children;
  if (siblings === null) return null;
  const idx = siblings.indexOf(sourceNode);
  if (idx === -1 || idx === siblings.length - 1) return null;
  return siblings[idx + 1];
}

/**
 * Returns the previous sibling of `source` (the child immediately before it in its parent's
 * children array), or `null` if `source` is the first child or has no parent.
 */
export function getNodePreviousSibling<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
): NodeOf<Fields> | null {
  const sourceNode = source as NodeOf<Fields>;
  const parent = getNodeParent(sourceNode);
  if (parent === null) return null;
  const siblings = getNodeRuntime(parent).children;
  if (siblings === null) return null;
  const idx = siblings.indexOf(sourceNode);
  if (idx <= 0) return null;
  return siblings[idx - 1];
}

/**
 * Walks the descendants of `source` in depth-first pre-order, calling `visit` for each node.
 * If `visit` returns `false`, the walk stops early (neither the current node's subtree nor any
 * remaining siblings are visited). Returns `true` if the walk completed without early termination,
 * `false` if it was cut short.
 */
export function walkNodeDescendants<Fields extends object = NodeFields>(
  source: Readonly<Node<Fields>>,
  visit: NodeDescendantVisitor<Fields>,
): boolean {
  const children = getNodeRuntime(source).children;
  if (children === null) return true;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!visit(child)) return false;
    if (!walkNodeDescendants(child, visit)) return false;
  }
  return true;
}

const _emptyChildren: readonly never[] = [];
