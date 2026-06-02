import { connectSignal } from '@flighthq/signals';
import type { SceneNode, SceneNodeRuntime, SceneNodeTraits } from '@flighthq/types';
import { SceneNodeKind } from '@flighthq/types';

import {
  addSceneChild,
  addSceneChildAt,
  containsSceneChild,
  getSceneChildAt,
  getSceneChildByName,
  getSceneChildIndex,
  getSceneNumChildren,
  getSceneParent,
  getSceneRoot,
  removeSceneChild,
  removeSceneChildAt,
  removeSceneChildren,
  setSceneChildIndex,
  swapSceneChildren,
  swapSceneChildrenAt,
} from './hierarchy';
import { createSceneNode, getSceneNodeRuntime, getSceneSignals } from './sceneNode';

let container: SceneNode<typeof TestGraph, SceneNodeTraits>;
let childA: SceneNode<typeof TestGraph, SceneNodeTraits>;
let childB: SceneNode<typeof TestGraph, SceneNodeTraits>;

beforeEach(() => {
  container = createSceneNode(TestGraph, SceneNodeKind);
  childA = createSceneNode(TestGraph, SceneNodeKind);
  childB = createSceneNode(TestGraph, SceneNodeKind);
});

function getChildren(source: SceneNode<typeof TestGraph>) {
  return getSceneNodeRuntime(source).children as SceneNode<typeof TestGraph>[];
}

function getEntityRuntime(source: SceneNode<typeof TestGraph>) {
  return getSceneNodeRuntime(source) as SceneNodeRuntime<typeof TestGraph>;
}

describe('addSceneChild', () => {
  it('addSceneChild adds a child to the end of the list', () => {
    addSceneChild(container, childA);

    expect(getSceneNumChildren(container)).toBe(1);
    expect(getSceneParent(childA)).toBe(container);
  });

  it('throws if child is null', () => {
    expect(() => addSceneChild(container, null as any)).toThrow(TypeError);
  });

  it('throws if child is the same as target', () => {
    expect(() => addSceneChild(container, container)).toThrow(TypeError);
  });

  it('removes child from previous parent before adding', () => {
    const other = createSceneNode(TestGraph, SceneNodeKind);

    addSceneChild(other, childA);
    expect(getSceneParent(childA)).toBe(other);

    addSceneChild(container, childA);

    expect(getSceneParent(childA)).toBe(container);
    expect(getSceneNumChildren(other)).toBe(0);
    expect(getSceneNumChildren(container)).toBe(1);
  });

  it('a child never has more than one parent', () => {
    const other = createSceneNode(TestGraph, SceneNodeKind);

    addSceneChild(container, childA);
    addSceneChild(other, childA);

    expect(getSceneParent(childA)).toBe(other);
    expect(getSceneNumChildren(container)).toBe(0);
    expect(getSceneNumChildren(other)).toBe(1);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(getSceneSignals(childA).onParentChanged, () => {
      called = true;
    });
    addSceneChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(getSceneSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addSceneChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildAdded on the parent with the child', () => {
    let added: unknown;
    connectSignal(getSceneSignals(container).onChildAdded, (child) => {
      added = child;
    });
    addSceneChild(container, childA);
    expect(added).toBe(childA);
  });

  it('does not call onChildAdded when reordering within the same parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);
    let called = false;
    connectSignal(getSceneSignals(container).onChildAdded, () => {
      called = true;
    });
    addSceneChildAt(container, childA, 1);
    expect(called).toBe(false);
  });
});

describe('addSceneChildAt', () => {
  it('addSceneChildAt inserts a child at the given index', () => {
    addSceneChild(container, childA);
    addSceneChildAt(container, childB, 0);

    expect(getSceneNumChildren(container)).toBe(2);
    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('addSceneChildAt allows inserting at the end (index === length)', () => {
    addSceneChild(container, childA);
    addSceneChildAt(container, childB, 1);

    expect(getSceneNumChildren(container)).toBe(2);
    expect(getChildren(container)[1]).toBe(childB);
  });

  it('addSceneChildAt throws if index is negative', () => {
    expect(() => addSceneChildAt(container, childA, -1)).toThrow();
  });

  it('throws if index is out of bounds', () => {
    expect(() => addSceneChildAt(container, childA, 1)).toThrow();
  });

  it('reorders child when added again to the same parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    // move childA to the front
    addSceneChildAt(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(getSceneSignals(childA).onParentChanged, () => {
      called = true;
    });
    addSceneChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(getSceneSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addSceneChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildAdded on the parent with the child', () => {
    let added: unknown;
    connectSignal(getSceneSignals(container).onChildAdded, (child) => {
      added = child;
    });
    addSceneChildAt(container, childA, 0);
    expect(added).toBe(childA);
  });
});

describe('containsSceneChild', () => {
  it('returns false if parent does not contain child', () => {
    expect(containsSceneChild(container, childA)).toBe(false);
  });

  it('returns true if parent does not contain child', () => {
    addSceneChild(container, childA);
    expect(containsSceneChild(container, childA)).toBe(true);
  });

  it('returns true if the child is located deeper in the heirarchy', () => {
    addSceneChild(container, childA);
    addSceneChild(childA, childB);
    expect(containsSceneChild(container, childB)).toBe(true);
  });
});

describe('getSceneChildAt', () => {
  it('returns null if there are no children', () => {
    expect(getSceneChildAt(container, 0)).toBeNull();
  });

  it('returns null if there are no children at the given index', () => {
    addSceneChild(container, childA);
    expect(getSceneChildAt(container, 1)).toBeNull();
    expect(getSceneChildAt(container, -1)).toBeNull();
  });

  it('returns a matching child at the given index', () => {
    addSceneChild(container, childA);
    expect(getSceneChildAt(container, 0)).toStrictEqual(childA);
  });
});

describe('getSceneChildByName', () => {
  it('returns null if there are no children', () => {
    expect(getSceneChildByName(container, 'hello')).toBeNull();
  });

  it('returns null if there are no children with the given name', () => {
    addSceneChild(container, childA);
    childA.name = 'childA';
    expect(getSceneChildByName(container, 'hello')).toBeNull();
  });

  it('returns the first child with the given name', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);
    childA.name = 'hello';
    childB.name = 'hello';
    expect(getSceneChildByName(container, 'hello')).toStrictEqual(childA);
  });

  it('does not iterate through descendents', () => {
    addSceneChild(container, childA);
    addSceneChild(childA, childB);
    childB.name = 'hello';
    expect(getSceneChildByName(container, 'hello')).toBeNull();
  });
});

describe('getSceneChildIndex', () => {
  it('returns -1 if object is not a child', () => {
    expect(getSceneChildIndex(container, childA)).toBe(-1);
  });

  it('returns the index if object is a child', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);
    expect(getSceneChildIndex(container, childA)).toBe(0);
    expect(getSceneChildIndex(container, childB)).toBe(1);
  });

  it('does not iterate through descendents', () => {
    addSceneChild(container, childA);
    addSceneChild(childA, childB);
    expect(getSceneChildIndex(container, childB)).toBe(-1);
  });
});

describe('getSceneNumChildren', () => {
  it('returns 0 if children is null', () => {
    const children = getEntityRuntime(container).children;
    expect(children).toBeNull();
    expect(getSceneNumChildren(container)).toBe(0);
  });

  it('returns length of runtime children array', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);
    const children = getEntityRuntime(container).children;
    expect(getSceneNumChildren(container)).toStrictEqual(children!.length);
  });
});

describe('getSceneParent', () => {
  it('returns runtime parent reference', () => {
    addSceneChild(container, childA);
    const parent = getEntityRuntime(childA).parent;
    expect(getSceneParent(childA)).toStrictEqual(parent);
  });
});

describe('getSceneRoot', () => {
  it('returns the node itself when it has no parent', () => {
    expect(getSceneRoot(childA)).toBe(childA);
  });

  it('returns the topmost ancestor', () => {
    addSceneChild(container, childA);
    addSceneChild(childA, childB);
    expect(getSceneRoot(childB)).toBe(container);
  });

  it('returns the direct parent when depth is one', () => {
    addSceneChild(container, childA);
    expect(getSceneRoot(childA)).toBe(container);
  });
});

describe('removeSceneChild', () => {
  it('removes the child and clears its parent', () => {
    addSceneChild(container, childA);
    expect(getSceneNumChildren(container)).toBe(1);

    removeSceneChild(container, childA);

    expect(getSceneNumChildren(container)).toBe(0);
    expect(getSceneParent(childA)).toBeNull();
  });

  it('does nothing if child is not a child of target', () => {
    addSceneChild(container, childA);

    const other = createSceneNode(TestGraph, SceneNodeKind);
    removeSceneChild(other, childA);

    expect(getSceneNumChildren(container)).toBe(1);
    expect(getSceneParent(childA)).toBe(container);
  });

  it('is safe when child is null', () => {
    expect(() => removeSceneChild(container, null as any)).not.toThrow();
  });

  it('always clears the parent reference', () => {
    addSceneChild(container, childA);
    removeSceneChild(container, childA);

    expect(getSceneParent(childA)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addSceneChild(container, childA);
    let called = false;
    connectSignal(getSceneSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeSceneChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addSceneChild(container, childA);
    let called = false;
    connectSignal(getSceneSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeSceneChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildRemoved on the parent with the child', () => {
    addSceneChild(container, childA);
    let removed: unknown;
    connectSignal(getSceneSignals(container).onChildRemoved, (child) => {
      removed = child;
    });
    removeSceneChild(container, childA);
    expect(removed).toBe(childA);
  });
});

describe('removeSceneChildAt', () => {
  it('removeSceneChildAt removes and returns the child at index', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    const removed = removeSceneChildAt(container, 0);

    expect(removed).toBe(childA);
    expect(getSceneNumChildren(container)).toBe(1);
    expect(getSceneParent(childA)).toBeNull();
    expect(getChildren(container)[0]).toBe(childB);
  });

  it('removeSceneChildAt returns null for out-of-range index', () => {
    expect(removeSceneChildAt(container, 0)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    let called = false;
    connectSignal(getSceneSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeSceneChildAt(container, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    let called = false;
    connectSignal(getSceneSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeSceneChildAt(container, 0);
    expect(called).toBe(true);
  });
});

describe('removeSceneChildren', () => {
  it('removeChildren removes all children by default', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    removeSceneChildren(container);

    expect(getSceneNumChildren(container)).toBe(0);
    expect(getSceneParent(childA)).toBeNull();
    expect(getSceneParent(childB)).toBeNull();
  });

  it('removeChildren removes a range of children', () => {
    const childC = createSceneNode(TestGraph, SceneNodeKind);

    addSceneChild(container, childA);
    addSceneChild(container, childB);
    addSceneChild(container, childC);

    removeSceneChildren(container, 1, 2);

    expect(getSceneNumChildren(container)).toBe(1);
    expect(getChildren(container)[0]).toBe(childA);
    expect(getSceneParent(childB)).toBeNull();
    expect(getSceneParent(childC)).toBeNull();
  });

  it('removeChildren does nothing if beginIndex is out of range', () => {
    addSceneChild(container, childA);

    removeSceneChildren(container, 5);

    expect(getSceneNumChildren(container)).toBe(1);
  });

  it('removeChildren throws if indices are invalid', () => {
    addSceneChild(container, childA);

    expect(() => removeSceneChildren(container, 0, 10)).toThrow(RangeError);
    expect(() => removeSceneChildren(container, -1, 0)).toThrow(RangeError);
  });

  it('calls onParentChanged on the child', () => {
    addSceneChild(container, childA);

    let called = false;
    connectSignal(getSceneSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeSceneChildren(container);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addSceneChild(container, childA);

    let called = false;
    connectSignal(getSceneSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeSceneChildren(container);
    expect(called).toBe(true);
  });
});

describe('setSceneChildIndex', () => {
  it('setChildIndex moves an existing child to a new index', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    setSceneChildIndex(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('setChildIndex does nothing if child is not in container', () => {
    const other = createSceneNode(TestGraph, SceneNodeKind);

    addSceneChild(other, childA);
    addSceneChild(container, childB);

    setSceneChildIndex(container, childA, 0);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getSceneParent(childA)).toBe(other);
  });

  it('setChildIndex ignores out-of-range indices', () => {
    addSceneChild(container, childA);

    setSceneChildIndex(container, childA, 5);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    let called = false;
    connectSignal(getSceneSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    setSceneChildIndex(container, childA, 1);
    expect(called).toBe(true);
  });
});

describe('swapSceneChildren', () => {
  it('swapSceneChildren swaps two children', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    swapSceneChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapSceneChildren does nothing if either child is not in container', () => {
    const other = createSceneNode(TestGraph, SceneNodeKind);

    addSceneChild(container, childA);
    addSceneChild(other, childB);

    swapSceneChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    let called = false;
    connectSignal(getSceneSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapSceneChildren(container, childA, childB);
    expect(called).toBe(true);
  });
});

describe('swapSceneChildrenAt', () => {
  it('swapSceneChildrenAt swaps children by index', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    swapSceneChildrenAt(container, 0, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapSceneChildrenAt assumes valid indices (throws if invalid)', () => {
    addSceneChild(container, childA);

    expect(() => swapSceneChildrenAt(container, 0, 1)).toThrow();
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addSceneChild(container, childA);
    addSceneChild(container, childB);

    let called = false;
    connectSignal(getSceneSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapSceneChildrenAt(container, 0, 1);
    expect(called).toBe(true);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');
