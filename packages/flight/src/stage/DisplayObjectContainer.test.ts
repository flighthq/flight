import DisplayObject from './DisplayObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';

describe('DisplayObjectContainer', () => {
  let container: DisplayObjectContainer;
  let childA: DisplayObject;
  let childB: DisplayObject;

  beforeEach(() => {
    container = new TestDisplayObjectContainer();
    childA = new TestDisplayObject();
    childB = new TestDisplayObject();
  });

  function getChildren(object: DisplayObject) {
    return object.children!;
  }

  // Constructor

  it('can be instantiated', () => {
    const container = new TestDisplayObjectContainer();
    expect(container).toBeInstanceOf(DisplayObject);
  });

  it('starts with zero children', () => {
    const container = new TestDisplayObjectContainer();
    expect(container.numChildren).toBe(0);
  });

  it('numChildren is read-only', () => {
    const container = new TestDisplayObjectContainer();

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
      container.addChild(childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('throws if child is null', () => {
      expect(() => container.addChild(null as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('throws if child is the same as target', () => {
      expect(() => container.addChild(container as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('removes child from previous parent before adding', () => {
      const other = new TestDisplayObjectContainer();

      other.addChild(childA);
      expect(childA.parent).toBe(other);

      container.addChild(childA);

      expect(childA.parent).toBe(container);
      expect(other.numChildren).toBe(0);
      expect(container.numChildren).toBe(1);
    });

    it('a child never has more than one parent', () => {
      const other = new TestDisplayObjectContainer();

      container.addChild(childA);
      other.addChild(childA);

      expect(childA.parent).toBe(other);
      expect(container.numChildren).toBe(0);
      expect(other.numChildren).toBe(1);
    });
  });

  describe('addChildAt', () => {
    it('addChildAt inserts a child at the given index', () => {
      container.addChild(childA);
      container.addChildAt(childB, 0);

      expect(container.numChildren).toBe(2);
      expect(getChildren(container)[0]).toBe(childB);
      expect(getChildren(container)[1]).toBe(childA);
    });

    it('addChildAt allows inserting at the end (index === length)', () => {
      container.addChild(childA);
      container.addChildAt(childB, 1);

      expect(container.numChildren).toBe(2);
      expect(getChildren(container)[1]).toBe(childB);
    });

    it('addChildAt throws if index is negative', () => {
      expect(() => container.addChildAt(childA, -1)).toThrow();
    });

    it('throws if index is out of bounds', () => {
      expect(() => container.addChildAt(childA, 1)).toThrow();
    });

    it('reorders child when added again to the same parent', () => {
      container.addChild(childA);
      container.addChild(childB);

      // move childA to the front
      container.addChildAt(childA, 1);

      expect(getChildren(container)[0]).toBe(childB);
      expect(getChildren(container)[1]).toBe(childA);
    });
  });

  describe('removeChild', () => {
    it('removes the child and clears its parent', () => {
      container.addChild(childA);
      expect(container.numChildren).toBe(1);

      container.removeChild(childA);

      expect(container.numChildren).toBe(0);
      expect(childA.parent).toBeNull();
    });

    it('does nothing if child is not a child of target', () => {
      container.addChild(childA);

      const other = new TestDisplayObjectContainer();
      other.removeChild(childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('is safe when child is null', () => {
      expect(() => container.removeChild(null as any)).not.toThrow(); // eslint-disable-line
    });

    it('always clears the parent reference', () => {
      container.addChild(childA);
      container.removeChild(childA);

      expect(childA.parent).toBeNull();
    });
  });

  describe('removeChildAt', () => {
    it('removeChildAt removes and returns the child at index', () => {
      container.addChild(childA);
      container.addChild(childB);

      const removed = container.removeChildAt(0);

      expect(removed).toBe(childA);
      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBeNull();
      expect(getChildren(container)[0]).toBe(childB);
    });

    it('removeChildAt returns null for out-of-range index', () => {
      expect(container.removeChildAt(0)).toBeNull();
    });
  });

  describe('removeChildren', () => {
    it('removeChildren removes all children by default', () => {
      container.addChild(childA);
      container.addChild(childB);

      container.removeChildren();

      expect(container.numChildren).toBe(0);
      expect(childA.parent).toBeNull();
      expect(childB.parent).toBeNull();
    });

    it('removeChildren removes a range of children', () => {
      const childC = new TestDisplayObject();

      container.addChild(childA);
      container.addChild(childB);
      container.addChild(childC);

      container.removeChildren(1, 2);

      expect(container.numChildren).toBe(1);
      expect(getChildren(container)[0]).toBe(childA);
      expect(childB.parent).toBeNull();
      expect(childC.parent).toBeNull();
    });

    it('removeChildren does nothing if beginIndex is out of range', () => {
      container.addChild(childA);

      container.removeChildren(5);

      expect(container.numChildren).toBe(1);
    });

    it('removeChildren throws if indices are invalid', () => {
      container.addChild(childA);

      expect(() => container.removeChildren(0, 10)).toThrow(RangeError);
      expect(() => container.removeChildren(-1, 0)).toThrow(RangeError);
    });
  });

  describe('setChildIndex', () => {
    it('setChildIndex moves an existing child to a new index', () => {
      container.addChild(childA);
      container.addChild(childB);

      container.setChildIndex(childA, 1);

      expect(getChildren(container)[0]).toBe(childB);
      expect(getChildren(container)[1]).toBe(childA);
    });

    it('setChildIndex does nothing if child is not in container', () => {
      const other = new TestDisplayObjectContainer();

      other.addChild(childA);
      container.addChild(childB);

      container.setChildIndex(childA, 0);

      expect(getChildren(container)[0]).toBe(childB);
      expect(childA.parent).toBe(other);
    });

    it('setChildIndex ignores out-of-range indices', () => {
      container.addChild(childA);

      container.setChildIndex(childA, 5);

      expect(getChildren(container)[0]).toBe(childA);
    });
  });

  describe('swapChildren', () => {
    it('swapChildren swaps two children', () => {
      container.addChild(childA);
      container.addChild(childB);

      container.swapChildren(childA, childB);

      expect(getChildren(container)[0]).toBe(childB);
      expect(getChildren(container)[1]).toBe(childA);
    });

    it('swapChildren does nothing if either child is not in container', () => {
      const other = new TestDisplayObjectContainer();

      container.addChild(childA);
      other.addChild(childB);

      container.swapChildren(childA, childB);

      expect(getChildren(container)[0]).toBe(childA);
    });
  });

  describe('swapChildrenAt', () => {
    it('swapChildrenAt swaps children by index', () => {
      container.addChild(childA);
      container.addChild(childB);

      container.swapChildrenAt(0, 1);

      expect(getChildren(container)[0]).toBe(childB);
      expect(getChildren(container)[1]).toBe(childA);
    });

    it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
      container.addChild(childA);

      expect(() => container.swapChildrenAt(0, 1)).toThrow();
    });
  });
});

class TestDisplayObject extends DisplayObject {
  constructor() {
    super();
  }
}

class TestDisplayObjectContainer extends DisplayObjectContainer {
  constructor() {
    super();
  }
}
