import type { GraphNode, GraphNodeRuntime } from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';
import type { GraphNodeInternal } from './internal';
import { getRuntime } from './node';

/**
 * Adds a child Node instance to this Node
 * instance. The child is added to the front (top) of all other children in
 * this Node instance.
 **/
export function addChild<G extends symbol>(target: GraphNode<G>, child: GraphNode<G>): GraphNode<G> {
  return addChildAt(target, child, target.children ? target.children.length : 0);
}

/**
 * Adds a child Node instance to this Node
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * Node object.
 **/
export function addChildAt<G extends symbol>(target: GraphNode<G>, child: GraphNode<G>, index: number): GraphNode<G> {
  if (!child) {
    throw new TypeError('Parameter child must be non-null');
  } else if (child === target) {
    throw new TypeError('An object cannot be added as a child of itself');
  } else if (
    index < 0 ||
    (target.children !== null && index > target.children!.length) ||
    (target.children === null && index > 0)
  ) {
    throwOutOfBoundsError();
  }

  const targetRuntime = getRuntime(target) as GraphNodeRuntime<G>;
  if (!targetRuntime.canAddChild(target, child)) {
    throw new TypeError('The specified parent object cannot add this child');
  }

  if (target.children === null) (target as GraphNodeInternal<G>).children = [];

  if (child.parent === target) {
    const i = target.children!.indexOf(child);
    if (i !== -1) {
      if (i === index) return child;
      target.children!.splice(i, 1);
    }
  } else {
    if (child.parent !== null) {
      removeChild(child.parent, child);
    }
  }

  target.children!.splice(index, 0, child);
  targetRuntime.onChildrenChanged(target);

  if (child.parent !== target) {
    (child as GraphNodeInternal<G>).parent = target;
    const childRuntime = getRuntime(child) as GraphNodeRuntime<G>;
    childRuntime.onParentChanged(child);
  }

  return child;
}

/**
 * Determines whether the specified scene node is a child of the
 * NodeContainer instance or the instance itself.
 **/
export function contains<G extends symbol>(source: Readonly<GraphNode<G>>, child: Readonly<GraphNode<G>>): boolean {
  let current: GraphNode<G> | null = child;
  while (current !== source && current !== null) {
    current = current.parent;
  }
  return current === source;
}

/**
 * Returns the child scene node instance that exists at the specified
 * index.
 **/
export function getChildAt<G extends symbol>(source: Readonly<GraphNode<G>>, index: number): GraphNode<G> | null {
  if (source.children !== null && index >= 0 && index < source.children.length) {
    return source.children[index];
  }
  return null;
}

/**
 * Returns the child scene node that exists with the specified name. If
 * more that one child scene node has the specified name, the method
 * returns the first object found.
 **/
export function getChildByName<G extends symbol>(source: Readonly<GraphNode<G>>, name: string): GraphNode<G> | null {
  if (source.children !== null) {
    const children = source.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].name === name) return children[i];
    }
  }
  return null;
}

/**
 * Returns the index position of a `child` Node instance.
 **/
export function getChildIndex<G extends symbol>(source: Readonly<GraphNode<G>>, child: Readonly<GraphNode<G>>): number {
  if (source.children !== null) {
    const children = source.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i] == child) return i;
    }
  }
  return -1;
}

/**
 * Removes the specified `child` Node instance from the
 * child list of the Node instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any scene nodes above the child in the
 * Node are decreased by 1.
 **/
export function removeChild<G extends symbol>(target: GraphNode<G>, child: GraphNode<G>): GraphNode<G> {
  if (target.children !== null && child && child.parent === target) {
    (child as GraphNodeInternal<G>).parent = null;
    const childRuntime = getGraphNodeRuntime(child);
    childRuntime.onParentChanged(child);
    const i = target.children.indexOf(child);
    if (i !== -1) {
      target.children.splice(i, 1);
    }
    const targetRuntime = getGraphNodeRuntime(target);
    targetRuntime.onChildrenChanged(target);
  }
  return child;
}

/**
 * Removes a child Node from the specified `index`
 * position in the child list of the Node. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any scene nodes
 * above the child in the Node are decreased by 1.
 **/
export function removeChildAt<G extends symbol>(target: GraphNode<G>, index: number): GraphNode<G> | null {
  if (target.children !== null && index >= 0 && index < target.children.length) {
    return removeChild(target, target.children[index]);
  }
  return null;
}

/**
 * Removes all `child` Node instances from the child list of the Node
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeChildren<G extends symbol>(
  target: GraphNode<G>,
  beginIndex: number = 0,
  endIndex?: number,
): void {
  if (target.children === null) return;
  if (beginIndex > target.children.length - 1) return;

  if (endIndex === undefined) {
    endIndex = target.children.length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > target.children.length) {
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
export function setChildIndex<G extends symbol>(target: GraphNode<G>, child: GraphNode<G>, index: number): void {
  if (target.children === null) return;
  if (index >= 0 && index <= target.children.length && child.parent === target) {
    const i = target.children.indexOf(child);
    if (i !== -1 && i !== index) {
      target.children.splice(i, 1);
      target.children.splice(index, 0, child);
      const targetRuntime = getGraphNodeRuntime(target);
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
export function swapChildren<G extends symbol>(target: GraphNode<G>, child1: GraphNode<G>, child2: GraphNode<G>): void {
  if (target.children !== null && child1.parent == target && child2.parent == target) {
    const index1 = target.children.indexOf(child1);
    const index2 = target.children.indexOf(child2);
    target.children[index1] = child2;
    target.children[index2] = child1;
    const targetRuntime = getGraphNodeRuntime(target);
    targetRuntime.onChildrenOrderChanged(target);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the scene node container remain in the same index positions.
 **/
export function swapChildrenAt<G extends symbol>(target: GraphNode<G>, index1: number, index2: number): void {
  if (target.children === null) return;
  const len = target.children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throwOutOfBoundsError();
  }

  if (index1 === index2) return;

  const swap: GraphNode<G> = target.children[index1];
  target.children[index1] = target.children[index2];
  target.children[index2] = swap;

  const targetRuntime = getGraphNodeRuntime(target);
  targetRuntime.onChildrenOrderChanged(target);
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}
