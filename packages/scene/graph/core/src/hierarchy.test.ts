import type { GraphNode, GraphNodeRuntime } from '@flighthq/types';
import { GraphNodeKind, NodeKind } from '@flighthq/types';

import { createGraphNode, getGraphNodeRuntime } from './graphNode';
import {
  addChild,
  addChildAt,
  contains,
  getChildAt,
  getChildByName,
  getChildIndex,
  getNumChildren,
  getParent,
  removeChild,
  removeChildAt,
  removeChildren,
  setChildIndex,
  swapChildren,
  swapChildrenAt,
} from './hierarchy';

let container: GraphNode<typeof TestGraph>;
let childA: GraphNode<typeof TestGraph>;
let childB: GraphNode<typeof TestGraph>;

beforeEach(() => {
  container = createGraphNode(TestGraph, GraphNodeKind);
  childA = createGraphNode(TestGraph, GraphNodeKind);
  childB = createGraphNode(TestGraph, GraphNodeKind);
});

function getChildren(source: GraphNode<typeof TestGraph>) {
  return getGraphNodeRuntime(source).children as GraphNode<typeof TestGraph>[];
}

function getRuntime(source: GraphNode<typeof TestGraph>) {
  return getGraphNodeRuntime(source) as GraphNodeRuntime<typeof TestGraph>;
}

describe('addChild', () => {
  it('addChild adds a child to the end of the list', () => {
    addChild(container, childA);

    expect(getNumChildren(container)).toBe(1);
    expect(getParent(childA)).toBe(container);
  });

  it('throws if child is null', () => {
    expect(() => addChild(container, null as any)).toThrow(TypeError); // eslint-disable-line
  });

  it('throws if child is the same as target', () => {
    expect(() => addChild(container, container)).toThrow(TypeError);  
  });

  it('removes child from previous parent before adding', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addChild(other, childA);
    expect(getParent(childA)).toBe(other);

    addChild(container, childA);

    expect(getParent(childA)).toBe(container);
    expect(getNumChildren(other)).toBe(0);
    expect(getNumChildren(container)).toBe(1);
  });

  it('a child never has more than one parent', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addChild(container, childA);
    addChild(other, childA);

    expect(getParent(childA)).toBe(other);
    expect(getNumChildren(container)).toBe(0);
    expect(getNumChildren(other)).toBe(1);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    const runtime = getRuntime(childA);
    runtime.onParentChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    addChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    addChild(container, childA);
    expect(called).toBe(true);
  });
});

describe('addChildAt', () => {
  it('addChildAt inserts a child at the given index', () => {
    addChild(container, childA);
    addChildAt(container, childB, 0);

    expect(getNumChildren(container)).toBe(2);
    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('addChildAt allows inserting at the end (index === length)', () => {
    addChild(container, childA);
    addChildAt(container, childB, 1);

    expect(getNumChildren(container)).toBe(2);
    expect(getChildren(container)[1]).toBe(childB);
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

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    const runtime = getRuntime(childA);
    runtime.onParentChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    addChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    addChildAt(container, childA, 0);
    expect(called).toBe(true);
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

describe('getNumChildren', () => {
  it('returns 0 if children is null', () => {
    const children = getRuntime(container).children;
    expect(children).toBeNull();
    expect(getNumChildren(container)).toBe(0);
  });

  it('returns length of runtime children array', () => {
    addChild(container, childA);
    addChild(container, childB);
    const children = getRuntime(container).children;
    expect(getNumChildren(container)).toStrictEqual(children!.length);
  });
});

describe('getParent', () => {
  it('returns runtime parent reference', () => {
    addChild(container, childA);
    const parent = getRuntime(childA).parent;
    expect(getParent(childA)).toStrictEqual(parent);
  });
});

describe('removeChild', () => {
  it('removes the child and clears its parent', () => {
    addChild(container, childA);
    expect(getNumChildren(container)).toBe(1);

    removeChild(container, childA);

    expect(getNumChildren(container)).toBe(0);
    expect(getParent(childA)).toBeNull();
  });

  it('does nothing if child is not a child of target', () => {
    addChild(container, childA);

    const other = createGraphNode(TestGraph, NodeKind);
    removeChild(other, childA);

    expect(getNumChildren(container)).toBe(1);
    expect(getParent(childA)).toBe(container);
  });

  it('is safe when child is null', () => {
    expect(() => removeChild(container, null as any)).not.toThrow(); // eslint-disable-line
  });

  it('always clears the parent reference', () => {
    addChild(container, childA);
    removeChild(container, childA);

    expect(getParent(childA)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addChild(container, childA);
    let called = false;
    const runtime = getRuntime(childA);
    runtime.onParentChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addChild(container, childA);
    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChild(container, childA);
    expect(called).toBe(true);
  });
});

describe('removeChildAt', () => {
  it('removeChildAt removes and returns the child at index', () => {
    addChild(container, childA);
    addChild(container, childB);

    const removed = removeChildAt(container, 0);

    expect(removed).toBe(childA);
    expect(getNumChildren(container)).toBe(1);
    expect(getParent(childA)).toBeNull();
    expect(getChildren(container)[0]).toBe(childB);
  });

  it('removeChildAt returns null for out-of-range index', () => {
    expect(removeChildAt(container, 0)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addChild(container, childA);
    addChild(container, childB);

    let called = false;
    const runtime = getRuntime(childA);
    runtime.onParentChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChildAt(container, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addChild(container, childA);
    addChild(container, childB);

    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChildAt(container, 0);
    expect(called).toBe(true);
  });
});

describe('removeChildren', () => {
  it('removeChildren removes all children by default', () => {
    addChild(container, childA);
    addChild(container, childB);

    removeChildren(container);

    expect(getNumChildren(container)).toBe(0);
    expect(getParent(childA)).toBeNull();
    expect(getParent(childB)).toBeNull();
  });

  it('removeChildren removes a range of children', () => {
    const childC = createGraphNode(TestGraph, NodeKind);

    addChild(container, childA);
    addChild(container, childB);
    addChild(container, childC);

    removeChildren(container, 1, 2);

    expect(getNumChildren(container)).toBe(1);
    expect(getChildren(container)[0]).toBe(childA);
    expect(getParent(childB)).toBeNull();
    expect(getParent(childC)).toBeNull();
  });

  it('removeChildren does nothing if beginIndex is out of range', () => {
    addChild(container, childA);

    removeChildren(container, 5);

    expect(getNumChildren(container)).toBe(1);
  });

  it('removeChildren throws if indices are invalid', () => {
    addChild(container, childA);

    expect(() => removeChildren(container, 0, 10)).toThrow(RangeError);
    expect(() => removeChildren(container, -1, 0)).toThrow(RangeError);
  });

  it('calls onParentChanged on the child', () => {
    addChild(container, childA);

    let called = false;
    const runtime = getRuntime(childA);
    runtime.onParentChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChildren(container);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addChild(container, childA);

    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    removeChildren(container);
    expect(called).toBe(true);
  });
});

describe('setChildIndex', () => {
  it('setChildIndex moves an existing child to a new index', () => {
    addChild(container, childA);
    addChild(container, childB);

    setChildIndex(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('setChildIndex does nothing if child is not in container', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addChild(other, childA);
    addChild(container, childB);

    setChildIndex(container, childA, 0);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getParent(childA)).toBe(other);
  });

  it('setChildIndex ignores out-of-range indices', () => {
    addChild(container, childA);

    setChildIndex(container, childA, 5);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addChild(container, childA);
    addChild(container, childB);

    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenOrderChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    setChildIndex(container, childA, 1);
    expect(called).toBe(true);
  });
});

describe('swapChildren', () => {
  it('swapChildren swaps two children', () => {
    addChild(container, childA);
    addChild(container, childB);

    swapChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapChildren does nothing if either child is not in container', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addChild(container, childA);
    addChild(other, childB);

    swapChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addChild(container, childA);
    addChild(container, childB);

    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenOrderChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    swapChildren(container, childA, childB);
    expect(called).toBe(true);
  });
});

describe('swapChildrenAt', () => {
  it('swapChildrenAt swaps children by index', () => {
    addChild(container, childA);
    addChild(container, childB);

    swapChildrenAt(container, 0, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
    addChild(container, childA);

    expect(() => swapChildrenAt(container, 0, 1)).toThrow();
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addChild(container, childA);
    addChild(container, childB);

    let called = false;
    const runtime = getRuntime(container);
    runtime.onChildrenOrderChanged = (_target: GraphNode<typeof TestGraph>) => {
      called = true;
    };
    swapChildrenAt(container, 0, 1);
    expect(called).toBe(true);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');
