import type { DisplayObject, DisplayObjectContainer } from '@flighthq/types';

import { getDerivedState } from './internal/derivedState';
import { invalidateAppearance, invalidateLocalBounds, invalidateWorldBounds } from './invalidate';

/**
 * Adds a child DisplayObject instance to this DisplayObjectContainer
 * instance. The child is added to the front (top) of all other children in
 * this DisplayObjectContainer instance.
 **/
export function addChild(target: DisplayObjectContainer, child: DisplayObject): DisplayObject {
  const state = getDerivedState(target);
  return addChildAt(target, child, state.children!.length);
}

/**
 * Adds a child DisplayObject instance to this DisplayObjectContainer
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * DisplayObjectContainer object.
 **/
export function addChildAt(target: DisplayObjectContainer, child: DisplayObject, index: number): DisplayObject {
  const state = getDerivedState(target);

  if (child === null) {
    throw new TypeError('Error #2007: Parameter child must be non-null.');
  } else if (child === target) {
    throw new TypeError('Error #2024: An object cannot be added as a child of itself.');
  } else if (child.stage == child) {
    throw new TypeError('Error #3783: A Stage object cannot be added as the child of another object.');
  } else if (index < 0 || index > state.children!.length) {
    throw 'Invalid index position ' + index;
  }

  if (child.parent === target) {
    const i = state.children!.indexOf(child);
    if (i !== -1) {
      if (i === index) return child;
      state.children!.splice(i, 1);
    }
  } else {
    if (child.parent !== null) {
      removeChild(child.parent, child);
    }
  }

  state.children!.splice(index, 0, child);
  (child as ParentAccess).parent = target;
  invalidateAppearance(target);
  invalidateWorldBounds(target);
  return child;
}

/**
 * Removes the specified `child` DisplayObject instance from the
 * child list of the DisplayObjectContainer instance. The `parent`
 * property of the removed child is set to `null` , and the object
 * is garbage collected if no other references to the child exist. The index
 * positions of any display objects above the child in the
 * DisplayObjectContainer are decreased by 1.
 **/
export function removeChild(target: DisplayObjectContainer, child: DisplayObject): DisplayObject {
  if (child !== null && child.parent === target) {
    if (target.stage !== null) {
      // if (child._stage !== null && target._stage.focus == child)
      // {
      // 	stage.focus = null;
      // }
    }
    const state = getDerivedState(target);
    (child as ParentAccess).parent = null;
    const i = state.children!.indexOf(child);
    if (i !== -1) {
      state.children!.splice(i, 1);
    }
    invalidateAppearance(target);
    invalidateWorldBounds(target);
  }
  return child;
}

/**
 * Removes a child DisplayObject from the specified `index`
 * position in the child list of the DisplayObjectContainer. The
 * `parent` property of the removed child is set to
 * `null`, and the object is garbage collected if no other
 * references to the child exist. The index positions of any display objects
 * above the child in the DisplayObjectContainer are decreased by 1.
 **/
export function removeChildAt(target: DisplayObjectContainer, index: number): DisplayObject | null {
  const state = getDerivedState(target);
  if (index >= 0 && index < state.children!.length) {
    return removeChild(target, state.children![index]);
  }
  return null;
}

/**
 * Removes all `child` DisplayObject instances from the child list of the DisplayObjectContainer
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeChildren(target: DisplayObjectContainer, beginIndex: number = 0, endIndex?: number): void {
  const state = getDerivedState(target);
  if (beginIndex > state.children!.length - 1) return;

  if (endIndex === undefined) {
    endIndex = state.children!.length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > state.children!.length) {
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
export function setChildIndex(target: DisplayObjectContainer, child: DisplayObject, index: number): void {
  const state = getDerivedState(target);
  if (index >= 0 && index <= state.children!.length && child.parent === target) {
    const i = state.children!.indexOf(child);
    if (i !== -1 && i !== index) {
      state.children!.splice(i, 1);
      state.children!.splice(index, 0, child);
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
export function swapChildren(target: DisplayObjectContainer, child1: DisplayObject, child2: DisplayObject): void {
  const state = getDerivedState(target);
  if (child1.parent == target && child2.parent == target) {
    const index1 = state.children!.indexOf(child1);
    const index2 = state.children!.indexOf(child2);
    state.children![index1] = child2;
    state.children![index2] = child1;
    invalidateAppearance(target);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the display object container remain in the same index positions.
 **/
export function swapChildrenAt(target: DisplayObjectContainer, index1: number, index2: number): void {
  const state = getDerivedState(target);
  const len = state.children!.length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  if (index1 === index2) return;

  const swap: DisplayObject = state.children![index1];
  state.children![index1] = state.children![index2];
  state.children![index2] = swap;
  invalidateAppearance(target);
}

// Get & Set Methods

export function getNumChildren(source: Readonly<DisplayObjectContainer>): number {
  const state = getDerivedState(source);
  return state.children ? state.children.length : 0;
}

type ParentAccess = Omit<DisplayObject, 'parent'> & {
  parent: DisplayObjectContainer | null;
};
