import { acquireMatrix, copyMatrix, inverseMatrix, multiplyMatrix, releaseMatrix } from '@flighthq/geometry/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type { Node, NodeOf, NodeRuntime, Transform2DNode } from '@flighthq/types/contract';

import { getNodeRuntime } from './node';
import { ensureNodeWorldMatrix, getNodeWorldMatrix } from './nodeTransform2d';
import { invalidateNodeLocalTransform, invalidateNodeParentReference, invalidateNodeWorldBounds } from './revision';

/**
 * Adds a child Node instance to this Node
 * instance. The child is added to the front (top) of all other children in
 * this Node instance.
 **/
export function addNodeChild<Traits extends object>(target: Node<Traits>, child: Node<Traits>): NodeOf<Traits> {
  return addNodeChildAt(target, child, getNodeChildCount(target));
}

/**
 * Adds a child Node instance to this Node
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * Node object.
 **/
export function addNodeChildAt<Traits extends object>(
  target: Node<Traits>,
  child: Node<Traits>,
  index: number,
): NodeOf<Traits> {
  const targetRuntime = getNodeRuntime(target) as NodeRuntime<Traits>;
  let children = targetRuntime.children;

  if (!child) {
    throw new TypeError('Parameter child must be non-null');
  } else if (child === target) {
    throw new TypeError('An object cannot be added as a child of itself');
  } else if (isNodeAncestorOf(child, target)) {
    throw new TypeError('An ancestor cannot be added as a child of its descendant');
  } else if (index < 0 || (children !== null && index > children.length) || (children === null && index > 0)) {
    throwOutOfBoundsError();
  }

  if (!targetRuntime.canAddChild(target, child)) {
    throw new TypeError('The specified parent object cannot add this child');
  }

  if (children === null) {
    children = targetRuntime.children = [] as Node<Traits>[];
  }

  const childRuntime = getNodeRuntime(child) as NodeRuntime<Traits>;
  const parent = childRuntime.parent as Node<Traits>;
  let wasChild = false;

  if (parent === target) {
    const i = children!.indexOf(child);
    if (i !== -1) {
      wasChild = true;
      // `index === children.length` means append. An already-last child is therefore unchanged.
      if (i === Math.min(index, children.length - 1)) return child as NodeOf<Traits>;
      children!.splice(i, 1);
    }
  } else {
    if (parent !== null) {
      removeNodeChild(parent, child);
    }
  }

  children!.splice(index, 0, child);
  invalidateNodeChildren(targetRuntime);
  if (!wasChild) invalidateNodeWorldBounds(target);
  const targetSignals = targetRuntime.nodeSignals;
  if (targetSignals !== null) emitSignal(targetSignals.onChildrenChanged);

  if (parent !== target) {
    childRuntime.parent = target;
    if (targetSignals !== null) emitSignal(targetSignals.onChildAdded, child);
    const childSignals = childRuntime.nodeSignals;
    if (childSignals !== null) emitSignal(childSignals.onParentChanged);
    invalidateNodeParentReference(child);
  }

  return child as NodeOf<Traits>;
}

/**
 * Adds multiple children to `target` in order, appending each after the last. Equivalent to
 * calling `addNodeChild` for each child but signals are still emitted per child.
 */
export function addNodeChildren<Traits extends object>(target: Node<Traits>, ...children: Node<Traits>[]): void {
  for (let i = 0; i < children.length; i++) {
    addNodeChild(target, children[i]);
  }
}

/**
 * Determines whether the specified scene node is a child of the
 * NodeContainer instance or the instance itself.
 **/
export function containsNodeChild<Traits extends object>(
  source: Readonly<Node<Traits>>,
  child: Readonly<Node<Traits>>,
): boolean {
  let current: Node<Traits> | null = child;
  while (current !== source && current !== null) {
    current = getNodeParent(current);
  }
  return current === source;
}

/**
 * Calls `callback` for each direct child of `source` in index order (back to front).
 * Stops early if `callback` returns `false`.
 */
export function forEachNodeChild<Traits extends object>(
  source: Readonly<Node<Traits>>,
  callback: (child: Node<Traits>, index: number) => boolean | void,
): void {
  const children = getNodeRuntime(source).children;
  if (children === null) return;
  for (let i = 0; i < children.length; i++) {
    if (callback(children[i] as Node<Traits>, i) === false) return;
  }
}

/**
 * Returns a read-only snapshot of all ancestors of `source`, from immediate parent toward the
 * root. The source node itself is not included.
 */
export function getNodeAncestors<Traits extends object>(source: Readonly<Node<Traits>>): readonly NodeOf<Traits>[] {
  const result: NodeOf<Traits>[] = [];
  let current = getNodeParent(source as Node<Traits>);
  while (current !== null) {
    result.push(current);
    current = getNodeParent(current);
  }
  return result;
}

/**
 * Returns the child scene node instance that exists at the specified
 * index.
 **/
export function getNodeChildAt<Traits extends object>(
  source: Readonly<Node<Traits>>,
  index: number,
): NodeOf<Traits> | null {
  const children = getNodeRuntime(source).children;
  if (children !== null && index >= 0 && index < children.length) {
    return children[index] as NodeOf<Traits>;
  }
  return null;
}

/**
 * Returns the child scene node that exists with the specified name. If
 * more that one child scene node has the specified name, the method
 * returns the first object found.
 **/
export function getNodeChildByName<Traits extends object>(
  source: Readonly<Node<Traits>>,
  name: string,
): NodeOf<Traits> | null {
  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i].name === name) return children[i] as NodeOf<Traits>;
    }
  }
  return null;
}

export function getNodeChildCount<Traits extends object>(source: Readonly<Node<Traits>>): number {
  const children = getNodeRuntime(source).children;
  return children !== null ? children.length : 0;
}

/**
 * Returns the index position of a `child` Node instance.
 **/
export function getNodeChildIndex<Traits extends object>(
  source: Readonly<Node<Traits>>,
  child: Readonly<Node<Traits>>,
): number {
  const children = getNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i] === child) return i;
    }
  }
  return -1;
}

/**
 * Returns the lowest common ancestor of `a` and `b`, or `null` if they share no common ancestor.
 * If one node is an ancestor of the other, that ancestor is returned.
 */
export function getNodeCommonAncestor<Traits extends object>(
  a: Readonly<Node<Traits>>,
  b: Readonly<Node<Traits>>,
): NodeOf<Traits> | null {
  // Build the ancestor set for `a`, then walk `b`'s chain to find the first match.
  const aAncestors = new Set<Node<Traits>>();
  aAncestors.add(a as Node<Traits>);
  let cur = getNodeParent(a as Node<Traits>);
  while (cur !== null) {
    aAncestors.add(cur);
    cur = getNodeParent(cur);
  }
  let bCur: Node<Traits> | null = b as Node<Traits>;
  while (bCur !== null) {
    if (aAncestors.has(bCur)) return bCur as NodeOf<Traits>;
    bCur = getNodeParent(bCur);
  }
  return null;
}

export function getNodeParent<Traits extends object>(source: Readonly<Node<Traits>>): NodeOf<Traits> | null {
  return getNodeRuntime(source).parent as NodeOf<Traits>;
}

/**
 * Returns the topmost ancestor of the node, or the node itself if it has no
 * parent.
 **/
export function getNodeRoot<Traits extends object>(source: Readonly<Node<Traits>>): NodeOf<Traits> {
  let current: NodeOf<Traits> = source as NodeOf<Traits>;
  let parent = getNodeParent(current);
  while (parent !== null) {
    current = parent;
    parent = getNodeParent(current);
  }
  return current as NodeOf<Traits>;
}

/**
 * Returns `true` if `ancestor` is the same node as `descendant` or is located above
 * `descendant` in the hierarchy.
 */
export function isNodeAncestorOf<Traits extends object>(
  ancestor: Readonly<Node<Traits>>,
  descendant: Readonly<Node<Traits>>,
): boolean {
  let current: Node<Traits> | null = descendant as Node<Traits>;
  while (current !== null) {
    if (current === ancestor) return true;
    current = getNodeParent(current);
  }
  return false;
}

/**
 * Removes the specified `child` Node instance from the
 * child list of the Node instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any scene nodes above the child in the
 * Node are decreased by 1.
 **/
export function removeNodeChild<Traits extends object>(target: Node<Traits>, child: Node<Traits>): NodeOf<Traits> {
  if (!child) return child;
  const targetRuntime = getNodeRuntime(target);
  const childRuntime = getNodeRuntime(child) as NodeRuntime<Traits>;
  const children = targetRuntime.children;
  if (children !== null && childRuntime.parent === target) {
    childRuntime.parent = null;
    const childSignals = childRuntime.nodeSignals;
    if (childSignals !== null) emitSignal(childSignals.onParentChanged);
    invalidateNodeParentReference(child);
    const i = children.indexOf(child);
    if (i !== -1) {
      children.splice(i, 1);
      invalidateNodeChildren(targetRuntime as NodeRuntime<Traits>);
      invalidateNodeWorldBounds(target);
    }
    const targetSignals = targetRuntime.nodeSignals;
    if (targetSignals !== null) {
      emitSignal(targetSignals.onChildRemoved, child);
      emitSignal(targetSignals.onChildrenChanged);
    }
  }
  return child as NodeOf<Traits>;
}

/**
 * Removes a child Node from the specified `index`
 * position in the child list of the Node. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any scene nodes
 * above the child in the Node are decreased by 1.
 **/
export function removeNodeChildAt<Traits extends object>(target: Node<Traits>, index: number): NodeOf<Traits> | null {
  const children = getNodeRuntime(target).children;
  if (children !== null && index >= 0 && index < children.length) {
    return removeNodeChild(target, children[index] as NodeOf<Traits>);
  }
  return null;
}

/**
 * Removes all `child` Node instances from the child list of the Node
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeNodeChildren<Traits extends object>(
  target: Node<Traits>,
  beginIndex: number = 0,
  endIndex?: number,
): void {
  const children = getNodeRuntime(target).children;
  if (children === null) return;
  if (beginIndex > children.length - 1) return;

  if (endIndex === undefined) {
    endIndex = children.length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > children.length) {
    throwOutOfBoundsError();
  }

  let numRemovals = endIndex - beginIndex;
  while (numRemovals >= 0) {
    removeNodeChildAt(target, beginIndex);
    numRemovals--;
  }
}

/**
 * Moves a child to a new parent while preserving its world-space position.
 * The child's local transform fields are recomputed so its effective world transform remains
 * unchanged. Its pivot is preserved; rotation and skew may be reparameterized because a general
 * affine matrix has multiple equivalent decompositions.
 *
 * To reparent without preserving world position (keeping local TRS unchanged),
 * use addNodeChild instead.
 */
export function reparentNode<Traits extends object>(
  child: Transform2DNode<Traits>,
  newParent: Transform2DNode<Traits>,
): NodeOf<Traits> {
  ensureNodeWorldMatrix(child);
  const oldWorld = acquireMatrix();
  const localM = acquireMatrix();
  try {
    copyMatrix(oldWorld, getNodeWorldMatrix(child));
    addNodeChild(newParent, child);
    inverseMatrix(localM, getNodeWorldMatrix(newParent));
    multiplyMatrix(localM, localM, oldWorld);

    const pivotX = child.pivotX;
    const pivotY = child.pivotY;
    // Use positive axis magnitudes and carry any reflection in the angle between the axes. This
    // represents every affine linear transform exactly, including reflected and skewed matrices.
    child.rotation = 0;
    child.scaleX = Math.sqrt(localM.a * localM.a + localM.b * localM.b);
    child.scaleY = Math.sqrt(localM.c * localM.c + localM.d * localM.d);
    child.skewX = Math.atan2(-localM.c, localM.d) * RAD_TO_DEG;
    child.skewY = Math.atan2(localM.b, localM.a) * RAD_TO_DEG;
    child.pivotX = pivotX;
    child.pivotY = pivotY;
    child.x = localM.tx + (localM.a * pivotX + localM.c * pivotY);
    child.y = localM.ty + (localM.b * pivotX + localM.d * pivotY);

    invalidateNodeLocalTransform(child);
  } finally {
    releaseMatrix(oldWorld);
    releaseMatrix(localM);
  }
  return child as unknown as NodeOf<Traits>;
}

/**
 * Replaces `oldChild` with `newChild` at the same index position in `target`'s children. If
 * `oldChild` is not a child of `target`, this is a no-op. If `newChild` is already a child of
 * `target`, it is moved to `oldChild`'s index.
 */
export function replaceNodeChild<Traits extends object>(
  target: Node<Traits>,
  oldChild: Node<Traits>,
  newChild: Node<Traits>,
): void {
  const index = getNodeChildIndex(target, oldChild);
  if (index === -1) return;
  removeNodeChild(target, oldChild);
  addNodeChildAt(target, newChild, index);
}

/**
 * Changes the position of an existing child in the scene node container.
 * This affects the layering of child objects.
 **/
export function setNodeChildIndex<Traits extends object>(
  target: Node<Traits>,
  child: Node<Traits>,
  index: number,
): void {
  const targetRuntime = getNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null) return;
  if (index >= 0 && index <= children.length && getNodeParent(child) === target) {
    const i = children.indexOf(child);
    const destination = Math.min(index, children.length - 1);
    if (i !== -1 && i !== destination) {
      children.splice(i, 1);
      children.splice(destination, 0, child);
      invalidateNodeChildren(targetRuntime as NodeRuntime<Traits>);
      const targetSignals = targetRuntime.nodeSignals;
      if (targetSignals !== null) emitSignal(targetSignals.onChildrenOrderChanged);
    }
  }
}

/**
 * Recursively stops the timeline execution of all MovieClips rooted at this object.
 **/
// static stopAllMovieClips(): void {}

/**
 * Swaps the z-order (front-to-back order) of the two specified child
 * objects. All other child objects in the scene node container remain in
 * the same index positions.
 **/
export function swapNodeChildren<Traits extends object>(
  target: Node<Traits>,
  child1: Node<Traits>,
  child2: Node<Traits>,
): void {
  const targetRuntime = getNodeRuntime(target);
  const children = targetRuntime.children;
  if (children !== null && getNodeParent(child1) === target && getNodeParent(child2) === target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    if (index1 === index2) return;
    children[index1] = child2;
    children[index2] = child1;
    invalidateNodeChildren(targetRuntime as NodeRuntime<Traits>);
    const targetSignals = (getNodeRuntime(target) as NodeRuntime<Traits>).nodeSignals;
    if (targetSignals !== null) emitSignal(targetSignals.onChildrenOrderChanged);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the scene node container remain in the same index positions.
 **/
export function swapNodeChildrenAt<Traits extends object>(target: Node<Traits>, index1: number, index2: number): void {
  const targetRuntime = getNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null || index1 === index2) return;
  const len = children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throwOutOfBoundsError();
  }
  const swap = children[index1] as Node<Traits>;
  children[index1] = children[index2];
  children[index2] = swap;
  invalidateNodeChildren(targetRuntime as NodeRuntime<Traits>);
  const targetSignals = targetRuntime.nodeSignals;
  if (targetSignals !== null) emitSignal(targetSignals.onChildrenOrderChanged);
}

// Child arrays are package-owned and mutate only through this module, so structural revision bumps
// are automatic rather than a caller-facing invalidation pairing. The revision is distinct from
// localContentId: changing descendants changes traversal/output without changing the parent's own
// rasterizable payload.
function invalidateNodeChildren<Traits extends object>(runtime: NodeRuntime<Traits>): void {
  runtime.childrenId = (runtime.childrenId + 1) >>> 0;
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}

const RAD_TO_DEG = 180 / Math.PI;
