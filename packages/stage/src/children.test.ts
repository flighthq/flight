import type { DisplayObject } from '@flighthq/types';

import {
  addChild,
  addChildAt,
  contains,
  getChildAt,
  getChildByName,
  getChildIndex,
  removeChild,
  removeChildAt,
  removeChildren,
  setChildIndex,
  swapChildren,
  swapChildrenAt,
} from './children';
import { createDisplayObject } from './createDisplayObject';
import { getGraphState } from './internal/graphState';
import { getAppearanceID } from './revision';

let container: DisplayObject;
let childA: DisplayObject;
let childB: DisplayObject;

beforeEach(() => {
  container = createDisplayObject();
  childA = createDisplayObject();
  childB = createDisplayObject();
});

describe('addChild', () => {
  it('addChild adds a child to the end of the list', () => {
    addChild(container, childA);

    expect(container.children!.length).toBe(1);
    expect(childA.parent).toBe(container);
  });

  it('throws if child is null', () => {
    expect(() => addChild(container, null as any)).toThrow(TypeError); // eslint-disable-line
  });

  it('throws if child is the same as target', () => {
    expect(() => addChild(container, container as any)).toThrow(TypeError); // eslint-disable-line
  });

  it('removes child from previous parent before adding', () => {
    const other = createDisplayObject();

    addChild(other, childA);
    expect(childA.parent).toBe(other);

    addChild(container, childA);

    expect(childA.parent).toBe(container);
    expect(other.children!.length).toBe(0);
    expect(container.children!.length).toBe(1);
  });

  it('a child never has more than one parent', () => {
    const other = createDisplayObject();

    addChild(container, childA);
    addChild(other, childA);

    expect(childA.parent).toBe(other);
    expect(container.children!.length).toBe(0);
    expect(other.children!.length).toBe(1);
  });

  it('invalidates appearance and world bounds', () => {
    addChild(container, childA);

    expect(getAppearanceID(container)).toBe(1);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
  });

  it('invalidates parent cache of child', () => {
    const state = getGraphState(childA);
    state.worldTransformUsingParentTransformID = 100;
    addChild(container, childA);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('addChildAt', () => {
  it('addChildAt inserts a child at the given index', () => {
    addChild(container, childA);
    addChildAt(container, childB, 0);

    expect(container.children!.length).toBe(2);
    expect(container.children![0]).toBe(childB);
    expect(container.children![1]).toBe(childA);
  });

  it('addChildAt allows inserting at the end (index === length)', () => {
    addChild(container, childA);
    addChildAt(container, childB, 1);

    expect(container.children!.length).toBe(2);
    expect(container.children![1]).toBe(childB);
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

    expect(container.children![0]).toBe(childB);
    expect(container.children![1]).toBe(childA);
  });

  it('invalidates appearance and world bounds', () => {
    addChildAt(container, childA, 0);

    expect(getAppearanceID(container)).toBe(1);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
  });

  it('invalidates parent cache of child', () => {
    const state = getGraphState(childA);
    state.worldTransformUsingParentTransformID = 100;
    addChild(container, childA);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('contains', () => {
  it('returns false if parent does not contain child', () => {
    expect(contains(container, childA)).toBe(false);
  });

  it('returns true if parent does not contain child', () => {
    addChild(container, childA);
    expect(contains(container, childA)).toBe(true);
  });

  it('returns true if the child is located deeper in the heirarchy', () => {
    addChild(container, childA);
    addChild(childA, childB);
    expect(contains(container, childB)).toBe(true);
  });
});

describe('getChildAt', () => {
  it('returns null if there are no children', () => {
    expect(getChildAt(container, 0)).toBeNull();
  });

  it('returns null if there are no children at the given index', () => {
    addChild(container, childA);
    expect(getChildAt(container, 1)).toBeNull();
    expect(getChildAt(container, -1)).toBeNull();
  });

  it('returns a matching child at the given index', () => {
    addChild(container, childA);
    expect(getChildAt(container, 0)).toStrictEqual(childA);
  });
});

describe('getChildByName', () => {
  it('returns null if there are no children', () => {
    expect(getChildByName(container, 'hello')).toBeNull();
  });

  it('returns null if there are no children with the given name', () => {
    addChild(container, childA);
    childA.name = 'childA';
    expect(getChildByName(container, 'hello')).toBeNull();
  });

  it('returns the first child with the given name', () => {
    addChild(container, childA);
    addChild(container, childB);
    childA.name = 'hello';
    childB.name = 'hello';
    expect(getChildByName(container, 'hello')).toStrictEqual(childA);
  });

  it('does not iterate through descendents', () => {
    addChild(container, childA);
    addChild(childA, childB);
    childB.name = 'hello';
    expect(getChildByName(container, 'hello')).toBeNull();
  });
});

describe('getChildIndex', () => {
  it('returns -1 if object is not a child', () => {
    expect(getChildIndex(container, childA)).toBe(-1);
  });

  it('returns the index if object is a child', () => {
    addChild(container, childA);
    addChild(container, childB);
    expect(getChildIndex(container, childA)).toBe(0);
    expect(getChildIndex(container, childB)).toBe(1);
  });

  it('does not iterate through descendents', () => {
    addChild(container, childA);
    addChild(childA, childB);
    expect(getChildIndex(container, childB)).toBe(-1);
  });
});

describe('removeChild', () => {
  it('removes the child and clears its parent', () => {
    addChild(container, childA);
    expect(container.children!.length).toBe(1);

    removeChild(container, childA);

    expect(container.children!.length).toBe(0);
    expect(childA.parent).toBeNull();
  });

  it('does nothing if child is not a child of target', () => {
    addChild(container, childA);

    const other = createDisplayObject();
    removeChild(other, childA);

    expect(container.children!.length).toBe(1);
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

  it('invalidates appearance and world bounds', () => {
    addChild(container, childA);
    expect(getAppearanceID(container)).toBe(1);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
    removeChild(container, childA);

    expect(getAppearanceID(container)).toBe(2);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
  });

  it('invalidates parent cache of child', () => {
    addChild(container, childA);
    const state = getGraphState(childA);
    state.worldTransformUsingParentTransformID = 100;
    removeChild(container, childA);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('removeChildAt', () => {
  it('removeChildAt removes and returns the child at index', () => {
    addChild(container, childA);
    addChild(container, childB);

    const removed = removeChildAt(container, 0);

    expect(removed).toBe(childA);
    expect(container.children!.length).toBe(1);
    expect(childA.parent).toBeNull();
    expect(container.children![0]).toBe(childB);
  });

  it('removeChildAt returns null for out-of-range index', () => {
    expect(removeChildAt(container, 0)).toBeNull();
  });

  it('invalidates appearance and world bounds', () => {
    addChild(container, childA);
    expect(getAppearanceID(container)).toBe(1);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
    addChild(container, childB);
    expect(getAppearanceID(container)).toBe(2);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);

    removeChildAt(container, 0);

    expect(getAppearanceID(container)).toBe(3);
    expect(getGraphState(container).worldBoundsRectUsingLocalBoundsID).toBe(-1);
  });

  it('invalidates parent cache of child', () => {
    addChild(container, childA);
    const state = getGraphState(childA);
    state.worldTransformUsingParentTransformID = 100;
    removeChild(container, childA);
    expect(state.worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('removeChildren', () => {
  it('removeChildren removes all children by default', () => {
    addChild(container, childA);
    addChild(container, childB);

    removeChildren(container);

    expect(container.children!.length).toBe(0);
    expect(childA.parent).toBeNull();
    expect(childB.parent).toBeNull();
  });

  it('removeChildren removes a range of children', () => {
    const childC = createDisplayObject();

    addChild(container, childA);
    addChild(container, childB);
    addChild(container, childC);

    removeChildren(container, 1, 2);

    expect(container.children!.length).toBe(1);
    expect(container.children![0]).toBe(childA);
    expect(childB.parent).toBeNull();
    expect(childC.parent).toBeNull();
  });

  it('removeChildren does nothing if beginIndex is out of range', () => {
    addChild(container, childA);

    removeChildren(container, 5);

    expect(container.children!.length).toBe(1);
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

    expect(container.children![0]).toBe(childB);
    expect(container.children![1]).toBe(childA);
  });

  it('setChildIndex does nothing if child is not in container', () => {
    const other = createDisplayObject();

    addChild(other, childA);
    addChild(container, childB);

    setChildIndex(container, childA, 0);

    expect(container.children![0]).toBe(childB);
    expect(childA.parent).toBe(other);
  });

  it('setChildIndex ignores out-of-range indices', () => {
    addChild(container, childA);

    setChildIndex(container, childA, 5);

    expect(container.children![0]).toBe(childA);
  });
});

describe('swapChildren', () => {
  it('swapChildren swaps two children', () => {
    addChild(container, childA);
    addChild(container, childB);

    swapChildren(container, childA, childB);

    expect(container.children![0]).toBe(childB);
    expect(container.children![1]).toBe(childA);
  });

  it('swapChildren does nothing if either child is not in container', () => {
    const other = createDisplayObject();

    addChild(container, childA);
    addChild(other, childB);

    swapChildren(container, childA, childB);

    expect(container.children![0]).toBe(childA);
  });
});

describe('swapChildrenAt', () => {
  it('swapChildrenAt swaps children by index', () => {
    addChild(container, childA);
    addChild(container, childB);

    swapChildrenAt(container, 0, 1);

    expect(container.children![0]).toBe(childB);
    expect(container.children![1]).toBe(childA);
  });

  it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
    addChild(container, childA);

    expect(() => swapChildrenAt(container, 0, 1)).toThrow();
  });
});
