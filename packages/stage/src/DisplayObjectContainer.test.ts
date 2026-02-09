import { RenderableSymbols as R } from '@flighthq/contracts';

import DisplayObject from './DisplayObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';

describe('DisplayObjectContainer', () => {
  let container: DisplayObjectContainer;
  let childA: DisplayObject;
  let childB: DisplayObject;

  beforeEach(() => {
    container = new DisplayObjectContainer();
    childA = new DisplayObject();
    childB = new DisplayObject();
  });
  // Constructor

  it('can be instantiated', () => {
    const container = new DisplayObjectContainer();
    expect(container).toBeInstanceOf(DisplayObjectContainer);
  });

  it('starts with zero children', () => {
    const container = new DisplayObjectContainer();
    expect(container.numChildren).toBe(0);
  });

  it('numChildren is read-only', () => {
    const container = new DisplayObjectContainer();

    expect(() => {
      // @ts-expect-error numChildren should not be writable
      container.numChildren = 1;
    }).toThrowError(TypeError);

    expect(container.numChildren).toBe(0);
  });

  // Properties

  // Methods

  describe('addChild', () => {
    it('addChild adds a child to the end of the list', () => {
      DisplayObjectContainer.addChild(container, childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('throws if child is null', () => {
      expect(() => DisplayObjectContainer.addChild(container, null as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('throws if child is the same as target', () => {
      expect(() => DisplayObjectContainer.addChild(container, container as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('removes child from previous parent before adding', () => {
      const other = new DisplayObjectContainer();

      DisplayObjectContainer.addChild(other, childA);
      expect(childA.parent).toBe(other);

      DisplayObjectContainer.addChild(container, childA);

      expect(childA.parent).toBe(container);
      expect(other.numChildren).toBe(0);
      expect(container.numChildren).toBe(1);
    });

    it('a child never has more than one parent', () => {
      const other = new DisplayObjectContainer();

      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(other, childA);

      expect(childA.parent).toBe(other);
      expect(container.numChildren).toBe(0);
      expect(other.numChildren).toBe(1);
    });
  });

  describe('addChildAt', () => {
    it('addChildAt inserts a child at the given index', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChildAt(container, childB, 0);

      expect(container.numChildren).toBe(2);
      expect(container[R.children][0]).toBe(childB);
      expect(container[R.children][1]).toBe(childA);
    });

    it('addChildAt allows inserting at the end (index === length)', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChildAt(container, childB, 1);

      expect(container.numChildren).toBe(2);
      expect(container[R.children][1]).toBe(childB);
    });

    it('addChildAt throws if index is negative', () => {
      expect(() => DisplayObjectContainer.addChildAt(container, childA, -1)).toThrow();
    });

    it('throws if index is out of bounds', () => {
      expect(() => DisplayObjectContainer.addChildAt(container, childA, 1)).toThrow();
    });

    it('reorders child when added again to the same parent', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      // move childA to the front
      DisplayObjectContainer.addChildAt(container, childA, 1);

      expect(container[R.children][0]).toBe(childB);
      expect(container[R.children][1]).toBe(childA);
    });
  });

  describe('removeChild', () => {
    it('removes the child and clears its parent', () => {
      DisplayObjectContainer.addChild(container, childA);
      expect(container.numChildren).toBe(1);

      DisplayObjectContainer.removeChild(container, childA);

      expect(container.numChildren).toBe(0);
      expect(childA.parent).toBeNull();
    });

    it('does nothing if child is not a child of target', () => {
      DisplayObjectContainer.addChild(container, childA);

      const other = new DisplayObjectContainer();
      DisplayObjectContainer.removeChild(other, childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('is safe when child is null', () => {
      expect(() => DisplayObjectContainer.removeChild(container, null as any)).not.toThrow(); // eslint-disable-line
    });

    it('always clears the parent reference', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.removeChild(container, childA);

      expect(childA.parent).toBeNull();
    });
  });

  describe('removeChildAt', () => {
    it('removeChildAt removes and returns the child at index', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      const removed = DisplayObjectContainer.removeChildAt(container, 0);

      expect(removed).toBe(childA);
      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBeNull();
      expect(container[R.children][0]).toBe(childB);
    });

    it('removeChildAt returns null for out-of-range index', () => {
      expect(DisplayObjectContainer.removeChildAt(container, 0)).toBeNull();
    });
  });

  describe('removeChildren', () => {
    it('removeChildren removes all children by default', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      DisplayObjectContainer.removeChildren(container);

      expect(container.numChildren).toBe(0);
      expect(childA.parent).toBeNull();
      expect(childB.parent).toBeNull();
    });

    it('removeChildren removes a range of children', () => {
      const childC = new DisplayObject();

      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);
      DisplayObjectContainer.addChild(container, childC);

      DisplayObjectContainer.removeChildren(container, 1, 2);

      expect(container.numChildren).toBe(1);
      expect(container[R.children][0]).toBe(childA);
      expect(childB.parent).toBeNull();
      expect(childC.parent).toBeNull();
    });

    it('removeChildren does nothing if beginIndex is out of range', () => {
      DisplayObjectContainer.addChild(container, childA);

      DisplayObjectContainer.removeChildren(container, 5);

      expect(container.numChildren).toBe(1);
    });

    it('removeChildren throws if indices are invalid', () => {
      DisplayObjectContainer.addChild(container, childA);

      expect(() => DisplayObjectContainer.removeChildren(container, 0, 10)).toThrow(RangeError);
      expect(() => DisplayObjectContainer.removeChildren(container, -1, 0)).toThrow(RangeError);
    });
  });

  describe('setChildIndex', () => {
    it('setChildIndex moves an existing child to a new index', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      DisplayObjectContainer.setChildIndex(container, childA, 1);

      expect(container[R.children][0]).toBe(childB);
      expect(container[R.children][1]).toBe(childA);
    });

    it('setChildIndex does nothing if child is not in container', () => {
      const other = new DisplayObjectContainer();

      DisplayObjectContainer.addChild(other, childA);
      DisplayObjectContainer.addChild(container, childB);

      DisplayObjectContainer.setChildIndex(container, childA, 0);

      expect(container[R.children][0]).toBe(childB);
      expect(childA.parent).toBe(other);
    });

    it('setChildIndex ignores out-of-range indices', () => {
      DisplayObjectContainer.addChild(container, childA);

      DisplayObjectContainer.setChildIndex(container, childA, 5);

      expect(container[R.children][0]).toBe(childA);
    });
  });

  describe('swapChildren', () => {
    it('swapChildren swaps two children', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      DisplayObjectContainer.swapChildren(container, childA, childB);

      expect(container[R.children][0]).toBe(childB);
      expect(container[R.children][1]).toBe(childA);
    });

    it('swapChildren does nothing if either child is not in container', () => {
      const other = new DisplayObjectContainer();

      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(other, childB);

      DisplayObjectContainer.swapChildren(container, childA, childB);

      expect(container[R.children][0]).toBe(childA);
    });
  });

  describe('swapChildrenAt', () => {
    it('swapChildrenAt swaps children by index', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      DisplayObjectContainer.swapChildrenAt(container, 0, 1);

      expect(container[R.children][0]).toBe(childB);
      expect(container[R.children][1]).toBe(childA);
    });

    it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
      DisplayObjectContainer.addChild(container, childA);

      expect(() => DisplayObjectContainer.swapChildrenAt(container, 0, 1)).toThrow();
    });
  });

  // Inherited aliases

  it('forwards static methods', () => {
    expect(DisplayObjectContainer.getBounds).toBe(DisplayObject.getBounds);
    expect(DisplayObjectContainer.getBoundsTo).toBe(DisplayObject.getBoundsTo);
    expect(DisplayObjectContainer.getRect).toBe(DisplayObject.getRect);
    expect(DisplayObjectContainer.getRectTo).toBe(DisplayObject.getRectTo);
    expect(DisplayObjectContainer.globalToLocal).toBe(DisplayObject.globalToLocal);
    expect(DisplayObjectContainer.globalToLocalTo).toBe(DisplayObject.globalToLocalTo);
    expect(DisplayObjectContainer.hitTestObject).toBe(DisplayObject.hitTestObject);
    expect(DisplayObjectContainer.hitTestPoint).toBe(DisplayObject.hitTestPoint);
    expect(DisplayObjectContainer.localToGlobal).toBe(DisplayObject.localToGlobal);
    expect(DisplayObjectContainer.localToGlobalTo).toBe(DisplayObject.localToGlobalTo);
    expect(DisplayObjectContainer.invalidate).toBe(DisplayObject.invalidate);
  });
});
