import DisplayObject from './DisplayObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';

describe('DisplayObjectContainer', () => {
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

  describe('DisplayObjectContainer (children management)', () => {
    let container: DisplayObjectContainer;
    let childA: DisplayObject;
    let childB: DisplayObject;

    beforeEach(() => {
      container = new DisplayObjectContainer();
      childA = new DisplayObject();
      childB = new DisplayObject();
    });

    it('addChild adds a child to the end of the list', () => {
      DisplayObjectContainer.addChild(container, childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('addChildAt inserts a child at the given index', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChildAt(container, childB, 0);

      expect(container.numChildren).toBe(2);
      expect(container['__children'][0]).toBe(childB);
      expect(container['__children'][1]).toBe(childA);
    });

    it('throws if child is null', () => {
      expect(() => DisplayObjectContainer.addChild(container, null as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('throws if child is the same as target', () => {
      expect(() => DisplayObjectContainer.addChild(container, container as any)).toThrow(TypeError); // eslint-disable-line
    });

    it('throws if index is out of bounds', () => {
      expect(() => DisplayObjectContainer.addChildAt(container, childA, 1)).toThrow();
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

    it('reorders child when added again to the same parent', () => {
      DisplayObjectContainer.addChild(container, childA);
      DisplayObjectContainer.addChild(container, childB);

      // move childA to the front
      DisplayObjectContainer.addChildAt(container, childA, 1);

      expect(container['__children'][0]).toBe(childB);
      expect(container['__children'][1]).toBe(childA);
    });

    it('removeChild removes the child and clears its parent', () => {
      DisplayObjectContainer.addChild(container, childA);
      expect(container.numChildren).toBe(1);

      DisplayObjectContainer.removeChild(container, childA);

      expect(container.numChildren).toBe(0);
      expect(childA.parent).toBeNull();
    });

    it('removeChild does nothing if child is not a child of target', () => {
      DisplayObjectContainer.addChild(container, childA);

      const other = new DisplayObjectContainer();
      DisplayObjectContainer.removeChild(other, childA);

      expect(container.numChildren).toBe(1);
      expect(childA.parent).toBe(container);
    });

    it('removeChild is safe when child is null', () => {
      expect(() => DisplayObjectContainer.removeChild(container, null as any)).not.toThrow(); // eslint-disable-line
    });
  });
});
