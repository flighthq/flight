import type { DisplayObject, DisplayObjectContainer, DisplayObjectDerivedState } from '@flighthq/types';

import * as displayObjectFunctions from './displayObject.js';
import {
  addChild,
  addChildAt,
  create,
  getBounds,
  getRect,
  globalToLocal,
  hitTestObject,
  hitTestPoint,
  invalidate,
  localToGlobal,
  removeChild,
  removeChildAt,
  removeChildren,
  setChildIndex,
  swapChildren,
  swapChildrenAt,
} from './displayObjectContainer.js';

describe('displayObjectContainer', () => {
  let container: DisplayObjectContainer;
  let containerState: DisplayObjectDerivedState;
  let childA: DisplayObject;
  let childB: DisplayObject;

  beforeEach(() => {
    container = create();
    containerState = displayObjectFunctions.getDerivedState(container);
    childA = displayObjectFunctions.create();
    childB = displayObjectFunctions.create();
  });
  // Constructor

  it('can be instantiated', () => {
    const container = create();
    // expect(container).toBeInstanceOf(DisplayObjectContainer);
  });

  it('starts with zero children', () => {
    const container = create();
    expect(containerState.children!.length).toBe(0);
  });

  // Methods

  describe('addChild', () => {
    it('addChild adds a child to the end of the list', () => {
      addChild(container, childA);

      expect(containerState.children!.length).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('throws if child is null', () => {
      expect(() => addChild(container, null as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('throws if child is the same as target', () => {
      expect(() => addChild(container, container as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('removes child from previous parent before adding', () => {
      const other = create();
      const otherState = displayObjectFunctions.getDerivedState(other);

      addChild(other, childA);
      expect(childA.parent).toBe(other);

      addChild(container, childA);

      expect(childA.parent).toBe(container);
      expect(otherState.children!.length).toBe(0);
      expect(containerState.children!.length).toBe(1);
    });

    it('a child never has more than one parent', () => {
      const other = create();
      const otherState = displayObjectFunctions.getDerivedState(other);

      addChild(container, childA);
      addChild(other, childA);

      expect(childA.parent).toBe(other);
      expect(containerState.children!.length).toBe(0);
      expect(otherState.children!.length).toBe(1);
    });
  });

  describe('addChildAt', () => {
    it('addChildAt inserts a child at the given index', () => {
      addChild(container, childA);
      addChildAt(container, childB, 0);

      expect(containerState.children!.length).toBe(2);
      expect(containerState.children![0]).toBe(childB);
      expect(containerState.children![1]).toBe(childA);
    });

    it('addChildAt allows inserting at the end (index === length)', () => {
      addChild(container, childA);
      addChildAt(container, childB, 1);

      expect(containerState.children!.length).toBe(2);
      expect(containerState.children![1]).toBe(childB);
    });

    it('addChildAt throws if index is negative', () => {
      expect(() => addChildAt(container, childA, -1)).toThrow();
    });

    it('throws if index is out of bounds', () => {
      expect(() => addChildAt(container, childA, 1)).toThrow();
    });

    it('reorders child when added again to the same parent', () => {
      addChild(container, childA);
      addChild(container, childB);

      // move childA to the front
      addChildAt(container, childA, 1);

      expect(containerState.children![0]).toBe(childB);
      expect(containerState.children![1]).toBe(childA);
    });
  });

  describe('removeChild', () => {
    it('removes the child and clears its parent', () => {
      addChild(container, childA);
      expect(containerState.children!.length).toBe(1);

      removeChild(container, childA);

      expect(containerState.children!.length).toBe(0);
      expect(childA.parent).toBeNull();
    });

    it('does nothing if child is not a child of target', () => {
      addChild(container, childA);

      const other = create();
      removeChild(other, childA);

      expect(containerState.children!.length).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('is safe when child is null', () => {
      expect(() => removeChild(container, null as any)).not.toThrow(); // eslint-disable-line
    });

    it('always clears the parent reference', () => {
      addChild(container, childA);
      removeChild(container, childA);

      expect(childA.parent).toBeNull();
    });
  });

  describe('removeChildAt', () => {
    it('removeChildAt removes and returns the child at index', () => {
      addChild(container, childA);
      addChild(container, childB);

      const removed = removeChildAt(container, 0);

      expect(removed).toBe(childA);
      expect(containerState.children!.length).toBe(1);
      expect(childA.parent).toBeNull();
      expect(containerState.children![0]).toBe(childB);
    });

    it('removeChildAt returns null for out-of-range index', () => {
      expect(removeChildAt(container, 0)).toBeNull();
    });
  });

  describe('removeChildren', () => {
    it('removeChildren removes all children by default', () => {
      addChild(container, childA);
      addChild(container, childB);

      removeChildren(container);

      expect(containerState.children!.length).toBe(0);
      expect(childA.parent).toBeNull();
      expect(childB.parent).toBeNull();
    });

    it('removeChildren removes a range of children', () => {
      const childC = displayObjectFunctions.create();

      addChild(container, childA);
      addChild(container, childB);
      addChild(container, childC);

      removeChildren(container, 1, 2);

      expect(containerState.children!.length).toBe(1);
      expect(containerState.children![0]).toBe(childA);
      expect(childB.parent).toBeNull();
      expect(childC.parent).toBeNull();
    });

    it('removeChildren does nothing if beginIndex is out of range', () => {
      addChild(container, childA);

      removeChildren(container, 5);

      expect(containerState.children!.length).toBe(1);
    });

    it('removeChildren throws if indices are invalid', () => {
      addChild(container, childA);

      expect(() => removeChildren(container, 0, 10)).toThrow(RangeError);
      expect(() => removeChildren(container, -1, 0)).toThrow(RangeError);
    });
  });

  describe('setChildIndex', () => {
    it('setChildIndex moves an existing child to a new index', () => {
      addChild(container, childA);
      addChild(container, childB);

      setChildIndex(container, childA, 1);

      expect(containerState.children![0]).toBe(childB);
      expect(containerState.children![1]).toBe(childA);
    });

    it('setChildIndex does nothing if child is not in container', () => {
      const other = create();

      addChild(other, childA);
      addChild(container, childB);

      setChildIndex(container, childA, 0);

      expect(containerState.children![0]).toBe(childB);
      expect(childA.parent).toBe(other);
    });

    it('setChildIndex ignores out-of-range indices', () => {
      addChild(container, childA);

      setChildIndex(container, childA, 5);

      expect(containerState.children![0]).toBe(childA);
    });
  });

  describe('swapChildren', () => {
    it('swapChildren swaps two children', () => {
      addChild(container, childA);
      addChild(container, childB);

      swapChildren(container, childA, childB);

      expect(containerState.children![0]).toBe(childB);
      expect(containerState.children![1]).toBe(childA);
    });

    it('swapChildren does nothing if either child is not in container', () => {
      const other = create();

      addChild(container, childA);
      addChild(other, childB);

      swapChildren(container, childA, childB);

      expect(containerState.children![0]).toBe(childA);
    });
  });

  describe('swapChildrenAt', () => {
    it('swapChildrenAt swaps children by index', () => {
      addChild(container, childA);
      addChild(container, childB);

      swapChildrenAt(container, 0, 1);

      expect(containerState.children![0]).toBe(childB);
      expect(containerState.children![1]).toBe(childA);
    });

    it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
      addChild(container, childA);

      expect(() => swapChildrenAt(container, 0, 1)).toThrow();
    });
  });

  // Inherited aliases

  it('forwards static methods', () => {
    expect(getBounds).toBe(displayObjectFunctions.getBounds);
    expect(getRect).toBe(displayObjectFunctions.getRect);
    expect(globalToLocal).toBe(displayObjectFunctions.globalToLocal);
    expect(hitTestObject).toBe(displayObjectFunctions.hitTestObject);
    expect(hitTestPoint).toBe(displayObjectFunctions.hitTestPoint);
    expect(localToGlobal).toBe(displayObjectFunctions.localToGlobal);
    expect(invalidate).toBe(displayObjectFunctions.invalidate);
  });
});
