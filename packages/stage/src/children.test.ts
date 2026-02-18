import type { DisplayObject } from '@flighthq/types';

import {
  addChild,
  addChildAt,
  removeChild,
  removeChildAt,
  removeChildren,
  setChildIndex,
  swapChildren,
  swapChildrenAt,
} from './container';
import { createDisplayObject } from './createDisplayObject';
import { getAppearanceID, getWorldBoundsID } from './revision';

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
    expect(getWorldBoundsID(container)).toBe(-1);
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
    expect(getWorldBoundsID(container)).toBe(-1);
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
    expect(getWorldBoundsID(container)).toBe(-1);
    removeChild(container, childA);

    expect(getAppearanceID(container)).toBe(2);
    expect(getWorldBoundsID(container)).toBe(-1);
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
    expect(getWorldBoundsID(container)).toBe(-1);
    addChild(container, childB);
    expect(getAppearanceID(container)).toBe(2);
    expect(getWorldBoundsID(container)).toBe(-1);

    removeChildAt(container, 0);

    expect(getAppearanceID(container)).toBe(3);
    expect(getWorldBoundsID(container)).toBe(-1);
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
