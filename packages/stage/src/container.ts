import type { DisplayObject } from '@flighthq/types';

import type { DisplayObjectInternal } from './internal/write';
import { invalidateAppearance, invalidateWorldBounds } from './revision';

/**
 * Adds a child DisplayObject instance to this DisplayObject
 * instance. The child is added to the front (top) of all other children in
 * this DisplayObject instance.
 **/
export function addChild(target: DisplayObject, child: DisplayObject): DisplayObject {
  return addChildAt(target, child, target.children ? target.children.length : 0);
}

/**
 * Adds a child DisplayObject instance to this DisplayObject
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * DisplayObject object.
 **/
export function addChildAt(target: DisplayObject, child: DisplayObject, index: number): DisplayObject {
  if (child === null) {
    throw new TypeError('Error #2007: Parameter child must be non-null.');
  } else if (child === target) {
    throw new TypeError('Error #2024: An object cannot be added as a child of itself.');
  } else if (child.stage == child) {
    throw new TypeError('Error #3783: A Stage object cannot be added as the child of another object.');
  } else if (
    index < 0 ||
    (target.children !== null && index > target.children!.length) ||
    (target.children === null && index > 0)
  ) {
    throw 'Invalid index position ' + index;
  }

  // TODO: Is target allowed to have children?
  if (target.children === null) (target as DisplayObjectInternal).children = [];

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
  (child as DisplayObjectInternal).parent = target;
  invalidateAppearance(target);
  invalidateWorldBounds(target);
  return child;
}

/**
 * Removes the specified `child` DisplayObject instance from the
 * child list of the DisplayObject instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any display objects above the child in the
 * DisplayObject are decreased by 1.
 **/
export function removeChild(target: DisplayObject, child: DisplayObject): DisplayObject {
  if (target.children !== null && child !== null && child.parent === target) {
    if (target.stage !== null) {
      // if (child._stage !== null && target._stage.focus == child)
      // {
      // 	stage.focus = null;
      // }
    }
    (child as DisplayObjectInternal).parent = null;
    const i = target.children.indexOf(child);
    if (i !== -1) {
      target.children.splice(i, 1);
    }
    invalidateAppearance(target);
    invalidateWorldBounds(target);
  }
  return child;
}

/**
 * Removes a child DisplayObject from the specified `index`
 * position in the child list of the DisplayObject. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any display objects
 * above the child in the DisplayObject are decreased by 1.
 **/
export function removeChildAt(target: DisplayObject, index: number): DisplayObject | null {
  if (target.children !== null && index >= 0 && index < target.children.length) {
    return removeChild(target, target.children[index]);
  }
  return null;
}

/**
 * Removes all `child` DisplayObject instances from the child list of the DisplayObject
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeChildren(target: DisplayObject, beginIndex: number = 0, endIndex?: number): void {
  if (target.children === null) return;
  if (beginIndex > target.children.length - 1) return;

  if (endIndex === undefined) {
    endIndex = target.children.length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > target.children.length) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  let numRemovals = endIndex - beginIndex;
  while (numRemovals >= 0) {
    removeChildAt(target, beginIndex);
    numRemovals--;
  }
}

/**
 * Changes the position of an existing child in the display object container.
 * This affects the layering of child objects.
 **/
export function setChildIndex(target: DisplayObject, child: DisplayObject, index: number): void {
  if (target.children === null) return;
  if (index >= 0 && index <= target.children.length && child.parent === target) {
    const i = target.children.indexOf(child);
    if (i !== -1 && i !== index) {
      target.children.splice(i, 1);
      target.children.splice(index, 0, child);
      invalidateAppearance(target);
    }
  }
}

/**
 * Recursively stops the timeline execution of all MovieClips rooted at this object.
 **/
// static stopAllMovieClips(): void {}

/**
 * Swaps the z-order (front-to-back order) of the two specified child
 * objects. All other child objects in the display object container remain in
 * the same index positions.
 **/
export function swapChildren(target: DisplayObject, child1: DisplayObject, child2: DisplayObject): void {
  if (target.children !== null && child1.parent == target && child2.parent == target) {
    const index1 = target.children.indexOf(child1);
    const index2 = target.children.indexOf(child2);
    target.children[index1] = child2;
    target.children[index2] = child1;
    invalidateAppearance(target);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the display object container remain in the same index positions.
 **/
export function swapChildrenAt(target: DisplayObject, index1: number, index2: number): void {
  if (target.children === null) return;
  const len = target.children.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  if (index1 === index2) return;

  const swap: DisplayObject = target.children[index1];
  target.children[index1] = target.children[index2];
  target.children[index2] = swap;
  invalidateAppearance(target);
}
