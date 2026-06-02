import { emitSignal } from '@flighthq/signals';
import type { Node, SceneHierarchyNode, SceneHierarchyNodeOf, SceneNode, SceneNodeRuntime } from '@flighthq/types';

import { invalidateParentReference } from './revision';
import { getSceneNodeRuntime } from './sceneNode';

/**
 * Adds a child Node instance to this Node
 * instance. The child is added to the front (top) of all other children in
 * this Node instance.
 **/
export function addSceneChild<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  child: SceneHierarchyNode<SceneKind, Traits>,
): SceneHierarchyNodeOf<SceneKind, Traits> {
  return addSceneChildAt(target, child, getSceneNumChildren(target));
}

/**
 * Adds a child Node instance to this Node
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * Node object.
 **/
export function addSceneChildAt<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  child: SceneHierarchyNode<SceneKind, Traits>,
  index: number,
): SceneHierarchyNodeOf<SceneKind, Traits> {
  const targetRuntime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
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
    children = targetRuntime.children = [] as SceneNode<SceneKind, Traits>[];
  }

  const childRuntime = getSceneNodeRuntime(child) as SceneNodeRuntime<SceneKind, Traits>;
  const parent = childRuntime.parent as SceneHierarchyNode<SceneKind, Traits>;

  if (parent === target) {
    const i = children!.indexOf(child);
    if (i !== -1) {
      if (i === index) return child as SceneHierarchyNodeOf<SceneKind, Traits>;
      children!.splice(i, 1);
    }
  } else {
    if (parent !== null) {
      removeSceneChild(parent, child);
    }
  }

  children!.splice(index, 0, child);
  emitSignal(targetRuntime.sceneSignals.onChildrenChanged);

  if (parent !== target) {
    childRuntime.parent = target;
    emitSignal(targetRuntime.sceneSignals.onChildAdded, child as SceneHierarchyNode);
    emitSignal(childRuntime.sceneSignals.onParentChanged);
    invalidateParentReference(child);
  }

  return child as SceneHierarchyNodeOf<SceneKind, Traits>;
}

/**
 * Determines whether the specified scene node is a child of the
 * NodeContainer instance or the instance itself.
 **/
export function containsSceneChild<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
  child: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
): boolean {
  let current: SceneHierarchyNode<SceneKind, Traits> | null = child;
  while (current !== source && current !== null) {
    current = getSceneParent(current);
  }
  return current === source;
}

/**
 * Returns the child scene node instance that exists at the specified
 * index.
 **/
export function getSceneChildAt<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
  index: number,
): SceneHierarchyNodeOf<SceneKind, Traits> | null {
  const children = getSceneNodeRuntime(source).children;
  if (children !== null && index >= 0 && index < children.length) {
    return children[index] as SceneHierarchyNodeOf<SceneKind, Traits>;
  }
  return null;
}

/**
 * Returns the child scene node that exists with the specified name. If
 * more that one child scene node has the specified name, the method
 * returns the first object found.
 **/
export function getSceneChildByName<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
  name: string,
): SceneHierarchyNodeOf<SceneKind, Traits> | null {
  const children = getSceneNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if ((children[i] as Node).name === name) return children[i] as SceneHierarchyNodeOf<SceneKind, Traits>;
    }
  }
  return null;
}

/**
 * Returns the index position of a `child` Node instance.
 **/
export function getSceneChildIndex<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
  child: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
): number {
  const children = getSceneNodeRuntime(source).children;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      if (children[i] == child) return i;
    }
  }
  return -1;
}

export function getSceneNumChildren<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
): number {
  const children = getSceneNodeRuntime(source).children;
  return children !== null ? children.length : 0;
}

export function getSceneParent<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
): SceneHierarchyNodeOf<SceneKind, Traits> | null {
  return getSceneNodeRuntime(source).parent as SceneHierarchyNodeOf<SceneKind, Traits>;
}

/**
 * Returns the topmost ancestor of the node, or the node itself if it has no
 * parent.
 **/
export function getSceneRoot<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneHierarchyNode<SceneKind, Traits>>,
): SceneHierarchyNodeOf<SceneKind, Traits> {
  let current: SceneHierarchyNodeOf<SceneKind, Traits> = source as SceneHierarchyNodeOf<SceneKind, Traits>;
  let parent = getSceneParent(current);
  while (parent !== null) {
    current = parent;
    parent = getSceneParent(current);
  }
  return current as SceneHierarchyNodeOf<SceneKind, Traits>;
}

/**
 * Removes the specified `child` Node instance from the
 * child list of the Node instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any scene nodes above the child in the
 * Node are decreased by 1.
 **/
export function removeSceneChild<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  child: SceneHierarchyNode<SceneKind, Traits>,
): SceneHierarchyNodeOf<SceneKind, Traits> {
  if (!child) return child;
  const targetRuntime = getSceneNodeRuntime(target);
  const childRuntime = getSceneNodeRuntime(child) as SceneNodeRuntime<SceneKind, Traits>;
  const children = targetRuntime.children;
  if (children !== null && childRuntime.parent === target) {
    childRuntime.parent = null;
    emitSignal(childRuntime.sceneSignals.onParentChanged);
    invalidateParentReference(child);
    const i = children.indexOf(child);
    if (i !== -1) {
      children.splice(i, 1);
    }
    emitSignal(targetRuntime.sceneSignals.onChildRemoved, child as SceneHierarchyNode);
    emitSignal(targetRuntime.sceneSignals.onChildrenChanged);
  }
  return child as SceneHierarchyNodeOf<SceneKind, Traits>;
}

/**
 * Removes a child Node from the specified `index`
 * position in the child list of the Node. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any scene nodes
 * above the child in the Node are decreased by 1.
 **/
export function removeSceneChildAt<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  index: number,
): SceneHierarchyNodeOf<SceneKind, Traits> | null {
  const children = getSceneNodeRuntime(target).children;
  if (children !== null && index >= 0 && index < children.length) {
    return removeSceneChild(target, children[index] as SceneHierarchyNodeOf<SceneKind, Traits>);
  }
  return null;
}

/**
 * Removes all `child` Node instances from the child list of the Node
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeSceneChildren<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  beginIndex: number = 0,
  endIndex?: number,
): void {
  const children = getSceneNodeRuntime(target).children;
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
    removeSceneChildAt(target, beginIndex);
    numRemovals--;
  }
}

/**
 * Changes the position of an existing child in the scene node container.
 * This affects the layering of child objects.
 **/
export function setSceneChildIndex<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  child: SceneHierarchyNode<SceneKind, Traits>,
  index: number,
): void {
  const targetRuntime = getSceneNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null) return;
  if (index >= 0 && index <= children.length && getSceneParent(child) === target) {
    const i = children.indexOf(child);
    if (i !== -1 && i !== index) {
      children.splice(i, 1);
      children.splice(index, 0, child);
      emitSignal(targetRuntime.sceneSignals.onChildrenOrderChanged);
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
export function swapSceneChildren<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  child1: SceneHierarchyNode<SceneKind, Traits>,
  child2: SceneHierarchyNode<SceneKind, Traits>,
): void {
  const targetRuntime = getSceneNodeRuntime(target);
  const children = targetRuntime.children;
  if (children !== null && getSceneParent(child1) == target && getSceneParent(child2) == target) {
    const index1 = children.indexOf(child1);
    const index2 = children.indexOf(child2);
    children[index1] = child2;
    children[index2] = child1;
    emitSignal(getSceneNodeRuntime(target).sceneSignals.onChildrenOrderChanged);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the scene node container remain in the same index positions.
 **/
export function swapSceneChildrenAt<SceneKind extends symbol, Traits extends object>(
  target: SceneHierarchyNode<SceneKind, Traits>,
  index1: number,
  index2: number,
): void {
  const targetRuntime = getSceneNodeRuntime(target);
  const children = targetRuntime.children;
  if (children === null || index1 === index2) return;
  const len = children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throwOutOfBoundsError();
  }
  const swap = children[index1] as SceneNode<SceneKind, Traits>;
  children[index1] = children[index2];
  children[index2] = swap;
  emitSignal(targetRuntime.sceneSignals.onChildrenOrderChanged);
}

function throwOutOfBoundsError(): void {
  throw new RangeError('The supplied index is out of bounds.');
}
