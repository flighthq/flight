import type { DisplayObject, DisplayObjectContainer } from '@flighthq/types';
import { DirtyFlags, DisplayObjectSymbols as $ } from '@flighthq/types';

import * as displayObjectFunctions from './displayObject.js';

// Constructor

export function create(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  displayObjectFunctions.create(obj);
  if (obj[$.children] === null) obj[$.children] = [];
  return obj as DisplayObjectContainer;
}

/**
 * Adds a child DisplayObject instance to this DisplayObjectContainer
 * instance. The child is added to the front (top) of all other children in
 * this DisplayObjectContainer instance.
 **/
export function addChild(target: DisplayObjectContainer, child: DisplayObject): DisplayObject {
  return addChildAt(target, child, target[$.children].length);
}

/**
 * Adds a child DisplayObject instance to this DisplayObjectContainer
 * instance. The child is added at the index position specified. An index of
 * 0 represents the back (bottom) of the display list for this
 * DisplayObjectContainer object.
 **/
export function addChildAt(target: DisplayObjectContainer, child: DisplayObject, index: number): DisplayObject {
  if (child === null) {
    throw new TypeError('Error #2007: Parameter child must be non-null.');
  } else if (child === target) {
    throw new TypeError('Error #2024: An object cannot be added as a child of itself.');
  } else if (child[$.stage] == child) {
    throw new TypeError('Error #3783: A Stage object cannot be added as the child of another object.');
  } else if (index < 0 || index > target[$.children]!.length) {
    throw 'Invalid index position ' + index;
  }

  if (child[$.parent] === target) {
    const i = target[$.children].indexOf(child);
    if (i !== -1) {
      target[$.children].splice(i, 1);
    }
  } else {
    if (child[$.parent] !== null) {
      removeChild(child[$.parent] as DisplayObjectContainer, child);
    }
  }

  target[$.children].splice(index, 0, child);
  child[$.parent] = target;
  displayObjectFunctions.invalidate(target, DirtyFlags.Children);
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
  if (child !== null && child[$.parent] === target) {
    if (target[$.stage] !== null) {
      // if (child._stage !== null && target._stage.focus == child)
      // {
      // 	stage.focus = null;
      // }
    }

    child[$.parent] = null;
    const i = target[$.children].indexOf(child);
    if (i !== -1) {
      target[$.children].splice(i, 1);
    }
    displayObjectFunctions.invalidate(child, DirtyFlags.Transform | DirtyFlags.Render);
    displayObjectFunctions.invalidate(target, DirtyFlags.Children);
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
  if (index >= 0 && index < target[$.children].length) {
    return removeChild(target, target[$.children][index]);
  }
  return null;
}

/**
 * Removes all `child` DisplayObject instances from the child list of the DisplayObjectContainer
 * instance. The `parent` property of the removed children is set to `null`, and the objects are
 * garbage collected if no other references to the children exist.
 **/
export function removeChildren(target: DisplayObjectContainer, beginIndex: number = 0, endIndex?: number): void {
  if (beginIndex > target[$.children].length - 1) return;

  if (endIndex === undefined) {
    endIndex = target[$.children].length - 1;
  }

  if (endIndex < beginIndex || beginIndex < 0 || endIndex > target[$.children].length) {
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
  if (index >= 0 && index <= target[$.children].length && child[$.parent] === target) {
    const i = target[$.children].indexOf(child);
    if (i !== -1) {
      target[$.children].splice(i, 1);
      target[$.children].splice(index, 0, child);
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
  if (child1[$.parent] == target && child2[$.parent] == target) {
    const index1 = target[$.children].indexOf(child1);
    const index2 = target[$.children].indexOf(child2);

    target[$.children][index1] = child2;
    target[$.children][index2] = child1;

    displayObjectFunctions.invalidate(target, DirtyFlags.Children);
  }
}

/**
 * Swaps the z-order (front-to-back order) of the child objects at the two
 * specified index positions in the child list. All other child objects in
 * the display object container remain in the same index positions.
 **/
export function swapChildrenAt(target: DisplayObjectContainer, index1: number, index2: number): void {
  const len = target[$.children].length;
  if (index1 < 0 || index2 < 0 || index1 >= len || index2 >= len) {
    throw new RangeError('The supplied index is out of bounds.');
  }

  if (index1 === index2) return;

  const swap: DisplayObject = target[$.children][index1];
  target[$.children][index1] = target[$.children][index2];
  target[$.children][index2] = swap;
  displayObjectFunctions.invalidate(target, DirtyFlags.Children);
}

// Get & Set Methods

export function getNumChildren(source: Readonly<DisplayObjectContainer>): number {
  return source[$.children] ? source[$.children].length : 0;
}

// Inherited Aliases

const { getBounds, getRect, globalToLocal, localToGlobal, hitTestObject, hitTestPoint, invalidate } =
  displayObjectFunctions;

export { getBounds, getRect, globalToLocal, hitTestObject, hitTestPoint, invalidate, localToGlobal };
