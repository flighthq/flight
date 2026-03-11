import type { GraphNode, GraphNodeRuntime, Node } from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';

/**
 * Adds a child Node instance to this Node
 * instance. The child is added to the front (top) of all other children in
 * this Node instance.
 **/
export function addChild<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
): GraphNode<GraphKind, Traits> & Traits {
  return addChildAt(target, child, getNumChildren(target));
}

/**
 * Adds a child Node instance to this Node
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * Node object.
 **/
export function addChildAt<GraphKind extends symbol, Traits extends object>(
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
    children = targetRuntime.children = [] as any; // eslint-disable-line
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
      removeChild(parent, child);
    }
  }

  children!.splice(index, 0, child);
  targetRuntime.onChildrenChanged(target);

  if (parent !== target) {
    childRuntime.parent = target;
    childRuntime.onParentChanged(child);
  }

  return child as GraphNode<GraphKind, Traits> & Traits;
}

/**
 * Determines whether the specified scene node is a child of the
 * NodeContainer instance or the instance itself.
 **/
export function contains<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  child: Readonly<GraphNode<GraphKind, Traits>>,
): boolean {
  let current: GraphNode<GraphKind, Traits> | null = child;
  while (current !== source && current !== null) {
    current = getParent(current);
  }
  return current === source;
}

/**
 * Returns the child scene node instance that exists at the specified
 * index.
 **/
export function getChildAt<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  index: number,
): GraphNode<GraphKind, Traits> | null {
  const children = getGraphNodeRuntime(source).children;
  if (children !== null && index >= 0 && index < children.length) {
    return children[index] as GraphNode<GraphKind, Traits>;
  }
  return null;
}

/**
 * Returns the child scene node that exists with the specified name. If
 * more that one child scene node has the specified name, the method
 * returns the first object found.
 **/
export function getChildByName<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
  name: string,
): GraphNode<GraphKind, Traits> | null {
  const children = getGraphNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if ((children[i] as Node).name === name) return children[i] as GraphNode<GraphKind, Traits>;
    }
  }
  return null;
}

/**
 * Returns the index position of a `child` Node instance.
 **/
export function getChildIndex<GraphKind extends symbol, Traits extends object>(
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

export function getNumChildren<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  const children = getGraphNodeRuntime(source).children;
  return children !== null ? children.length : 0;
}

export function getParent<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): GraphNode<GraphKind, Traits> | null {
  return getGraphNodeRuntime(source).parent as GraphNode<GraphKind, Traits>;
}

/**
 * Removes the specified `child` Node instance from the
 * child list of the Node instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any scene nodes above the child in the
 * Node are decreased by 1.
 **/
export function removeChild<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
): GraphNode<GraphKind, Traits> & Traits {
  if (!child) return child;
  const targetRuntime = getGraphNodeRuntime(target);
  const childRuntime = getGraphNodeRuntime(child) as GraphNodeRuntime<GraphKind, Traits>;
  const children = targetRuntime.children;
  if (children !== null && childRuntime.parent === target) {
    childRuntime.parent = null;
    childRuntime.onParentChanged(child);
    const i = children.indexOf(child);
    if (i !== -1) {
      children.splice(i, 1);
    }
    targetRuntime.onChildrenChanged(target);
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
export function removeChildAt<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  index: number,
): GraphNode<GraphKind, Traits> | null {
  const children = getGraphNodeRuntime(target).children;
  if (children !== null && index >= 0 && index < children.length) {
    return removeChild(target, children[index] as GraphNode<GraphKind, Traits> & Traits);
  }
  return null;
}

/**
 * Removes all `child` Node instances from the child list of the Node
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeChildren<GraphKind extends symbol, Traits extends object>(
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
    removeChildAt(target, beginIndex);
    numRemovals--;
  }
}

/**
 * Changes the position of an existing child in the scene node container.
 * This affects the layering of child objects.
 **/
export function setChildIndex<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child: GraphNode<GraphKind, Traits> & Traits,
  index: number,
): void {
  const targetRuntime = getGraphNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null) return;
  if (index >= 0 && index <= children.length && getParent(child) === target) {
    const i = children.indexOf(child);
    if (i !== -1 && i !== index) {
      children.splice(i, 1);
      children.splice(index, 0, child);
      targetRuntime.onChildrenOrderChanged(target);
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
export function swapChildren<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & Traits,
  child1: GraphNode<GraphKind, Traits> & Traits,
  child2: GraphNode<GraphKind, Traits> & Traits,
): void {
  const targetRuntime = getGraphNodeRuntime(target);
  const children = targetRuntime.children;
  if (children !== null && getParent(child1) == target && getParent(child2) == target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    children[index1] = child2;
    children[index2] = child1;
    targetRuntime.onChildrenOrderChanged(target);
  }
}

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
  targetRuntime.onChildrenOrderChanged(target);
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}
