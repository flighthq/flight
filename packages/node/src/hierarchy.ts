import { emitSignal } from '@flighthq/signals';
import type { Node, NodeOf, NodeRuntime } from '@flighthq/types';

import { getNodeRuntime } from './node';
import { invalidateNodeParentReference } from './revision';

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

  if (parent === target) {
    const i = children!.indexOf(child);
    if (i !== -1) {
      if (i === index) return child as NodeOf<Traits>;
      children!.splice(i, 1);
    }
  } else {
    if (parent !== null) {
      removeNodeChild(parent, child);
    }
  }

  children!.splice(index, 0, child);
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
      if (children[i] == child) return i;
    }
  }
  return -1;
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
    if (i !== -1 && i !== index) {
      children.splice(i, 1);
      children.splice(index, 0, child);
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
  if (children !== null && getNodeParent(child1) == target && getNodeParent(child2) == target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    children[index1] = child2;
    children[index2] = child1;
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
  const targetSignals = targetRuntime.nodeSignals;
  if (targetSignals !== null) emitSignal(targetSignals.onChildrenOrderChanged);
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}
