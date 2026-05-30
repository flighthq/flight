import { emitSignal } from '@flighthq/signals';
import type { GraphNode, GraphNodeRuntime, Node } from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';
import { invalidateParentReference } from './revision';

/**
 * Adds a child Node instance to this Node
 * instance. The child is added to the front (top) of all other children in
 * this Node instance.
 **/
export function addGraphChild<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
): GraphNode<GraphKind, Traits> & Traits {
  return addGraphChildAt(target, child, getGraphNumChildren(target));
}

/**
 * Adds a child Node instance to this Node
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * Node object.
 **/
export function addGraphChildAt<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
  index: number,
): GraphNode<GraphKind, Traits> & Traits {
  const targetRuntime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
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
    children = targetRuntime.children = [] as GraphNode<GraphKind, Traits>[];
  }

  const childRuntime = getGraphNodeRuntime(child) as GraphNodeRuntime<GraphKind, Traits>;
  const parent = childRuntime.parent as GraphNode<GraphKind, Traits> & Traits;

  if (parent === target) {
    const i = children!.indexOf(child);
    if (i !== -1) {
      if (i === index) return child as GraphNode<GraphKind, Traits> & Traits;
      children!.splice(i, 1);
    }
  } else {
    if (parent !== null) {
      removeGraphChild(parent, child);
    }
  }

  children!.splice(index, 0, child);
  const targetSignals = targetRuntime.signals;
  if (targetSignals) emitSignal(targetSignals.onChildrenChanged);

  if (parent !== target) {
    childRuntime.parent = target;
    const childSignals = childRuntime.signals;
    if (childSignals) emitSignal(childSignals.onParentChanged);
    invalidateParentReference(child);
  }

  return child as GraphNode<GraphKind, Traits> & Traits;
}

/**
 * Determines whether the specified scene node is a child of the
 * NodeContainer instance or the instance itself.
 **/
export function containsGraphChild<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  child: Readonly<GraphNode<GraphKind, Traits>>,
): boolean {
  let current: GraphNode<GraphKind, Traits> | null = child;
  while (current !== source && current !== null) {
    current = getGraphParent(current);
  }
  return current === source;
}

/**
 * Returns the child scene node instance that exists at the specified
 * index.
 **/
export function getGraphChildAt<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  index: number,
): (GraphNode<GraphKind, Traits> & Traits) | null {
  const children = getGraphNodeRuntime(source).children;
  if (children !== null && index >= 0 && index < children.length) {
    return children[index] as GraphNode<GraphKind, Traits> & Traits;
  }
  return null;
}

/**
 * Returns the child scene node that exists with the specified name. If
 * more that one child scene node has the specified name, the method
 * returns the first object found.
 **/
export function getGraphChildByName<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  name: string,
): (GraphNode<GraphKind, Traits> & Traits) | null {
  const children = getGraphNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if ((children[i] as Node).name === name) return children[i] as GraphNode<GraphKind, Traits> & Traits;
    }
  }
  return null;
}

/**
 * Returns the index position of a `child` Node instance.
 **/
export function getGraphChildIndex<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  child: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  const children = getGraphNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i] == child) return i;
    }
  }
  return -1;
}

export function getGraphNumChildren<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  const children = getGraphNodeRuntime(source).children;
  return children !== null ? children.length : 0;
}

export function getGraphParent<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): (GraphNode<GraphKind, Traits> & Traits) | null {
  return getGraphNodeRuntime(source).parent as GraphNode<GraphKind, Traits> & Traits;
}

/**
 * Returns the topmost ancestor of the node, or the node itself if it has no
 * parent.
 **/
export function getGraphRoot<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): GraphNode<GraphKind, Traits> & Traits {
  let current: GraphNode<GraphKind, Traits> = source as GraphNode<GraphKind, Traits>;
  let parent = getGraphParent(current);
  while (parent !== null) {
    current = parent;
    parent = getGraphParent(current);
  }
  return current as GraphNode<GraphKind, Traits> & Traits;
}

/**
 * Removes the specified `child` Node instance from the
 * child list of the Node instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any scene nodes above the child in the
 * Node are decreased by 1.
 **/
export function removeGraphChild<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
): GraphNode<GraphKind, Traits> & Traits {
  if (!child) return child;
  const targetRuntime = getGraphNodeRuntime(target);
  const childRuntime = getGraphNodeRuntime(child) as GraphNodeRuntime<GraphKind, Traits>;
  const children = targetRuntime.children;
  if (children !== null && childRuntime.parent === target) {
    childRuntime.parent = null;
    const childSignals = childRuntime.signals;
    if (childSignals) emitSignal(childSignals.onParentChanged);
    invalidateParentReference(child);
    const i = children.indexOf(child);
    if (i !== -1) {
      children.splice(i, 1);
    }
    const targetSignals = targetRuntime.signals;
    if (targetSignals) emitSignal(targetSignals.onChildrenChanged);
  }
  return child as GraphNode<GraphKind, Traits> & Traits;
}

/**
 * Removes a child Node from the specified `index`
 * position in the child list of the Node. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any scene nodes
 * above the child in the Node are decreased by 1.
 **/
export function removeGraphChildAt<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  index: number,
): GraphNode<GraphKind, Traits> | null {
  const children = getGraphNodeRuntime(target).children;
  if (children !== null && index >= 0 && index < children.length) {
    return removeGraphChild(target, children[index] as GraphNode<GraphKind, Traits> & Traits);
  }
  return null;
}

/**
 * Removes all `child` Node instances from the child list of the Node
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeGraphChildren<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  beginIndex: number = 0,
  endIndex?: number,
): void {
  const children = getGraphNodeRuntime(target).children;
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
    removeGraphChildAt(target, beginIndex);
    numRemovals--;
  }
}

/**
 * Changes the position of an existing child in the scene node container.
 * This affects the layering of child objects.
 **/
export function setGraphChildIndex<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
  index: number,
): void {
  const targetRuntime = getGraphNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null) return;
  if (index >= 0 && index <= children.length && getGraphParent(child) === target) {
    const i = children.indexOf(child);
    if (i !== -1 && i !== index) {
      children.splice(i, 1);
      children.splice(index, 0, child);
      const signals = targetRuntime.signals;
      if (signals) emitSignal(signals.onChildrenOrderChanged);
    }
  }
}

/**
 * Recursively stops the timeline execution of all MovieClips rooted at this object.
 **/
// static stopAllMovieClips(): void {}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the scene node container remain in the same index positions.
 **/
export function swapChildrenAt<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
  index1: number,
  index2: number,
): void {
  const targetRuntime = getGraphNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null || index1 === index2) return;
  const len = children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throwOutOfBoundsError();
  }
  const swap = children[index1] as GraphNode<GraphKind, Traits>;
  children[index1] = children[index2];
  children[index2] = swap;
  const signals = targetRuntime.signals;
  if (signals) emitSignal(signals.onChildrenOrderChanged);
}

/**
 * Swaps the z-order (front-to-back order) of the two specified child
 * objects. All other child objects in the scene node container remain in
 * the same index positions.
 **/
export function swapGraphChildren<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child1: GraphNode<GraphKind, Traits> & Traits,
  child2: GraphNode<GraphKind, Traits> & Traits,
): void {
  const targetRuntime = getGraphNodeRuntime(target);
  const children = targetRuntime.children;
  if (children !== null && getGraphParent(child1) == target && getGraphParent(child2) == target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    children[index1] = child2;
    children[index2] = child1;
    const signals = getGraphNodeRuntime(target).signals;
    if (signals) emitSignal(signals.onChildrenOrderChanged);
  }
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}
