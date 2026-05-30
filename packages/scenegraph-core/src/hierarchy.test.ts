import { connectSignal } from '@flighthq/signals';
import type { GraphNode, GraphNodeRuntime, GraphNodeTraits } from '@flighthq/types';
import { GraphNodeKind, NodeKind } from '@flighthq/types';

import { createGraphNode, getGraphNodeRuntime, getGraphNodeSignals } from './graphNode';
import {
  addGraphChild,
  addGraphChildAt,
  containsGraphChild,
  getGraphChildAt,
  getGraphChildByName,
  getGraphChildIndex,
  getGraphNumChildren,
  getGraphParent,
  getGraphRoot,
  removeGraphChild,
  removeGraphChildAt,
  removeGraphChildren,
  setGraphChildIndex,
  swapChildrenAt,
  swapGraphChildren,
} from './hierarchy';

let container: GraphNode<typeof TestGraph, GraphNodeTraits>;
let childA: GraphNode<typeof TestGraph, GraphNodeTraits>;
let childB: GraphNode<typeof TestGraph, GraphNodeTraits>;

beforeEach(() => {
  container = createGraphNode(TestGraph, GraphNodeKind);
  childA = createGraphNode(TestGraph, GraphNodeKind);
  childB = createGraphNode(TestGraph, GraphNodeKind);
});

function getChildren(source: GraphNode<typeof TestGraph>) {
  return getGraphNodeRuntime(source).children as GraphNode<typeof TestGraph>[];
}

function getEntityRuntime(source: GraphNode<typeof TestGraph>) {
  return getGraphNodeRuntime(source) as GraphNodeRuntime<typeof TestGraph>;
}

describe('addGraphChild', () => {
  it('addChild adds a child to the end of the list', () => {
    addGraphChild(container, childA);

    expect(getGraphNumChildren(container)).toBe(1);
    expect(getGraphParent(childA)).toBe(container);
  });

  it('throws if child is null', () => {
    expect(() => addGraphChild(container, null as any)).toThrow(TypeError);
  });

  it('throws if child is the same as target', () => {
    expect(() => addGraphChild(container, container)).toThrow(TypeError);
  });

  it('removes child from previous parent before adding', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addGraphChild(other, childA);
    expect(getGraphParent(childA)).toBe(other);

    addGraphChild(container, childA);

    expect(getGraphParent(childA)).toBe(container);
    expect(getGraphNumChildren(other)).toBe(0);
    expect(getGraphNumChildren(container)).toBe(1);
  });

  it('a child never has more than one parent', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addGraphChild(container, childA);
    addGraphChild(other, childA);

    expect(getGraphParent(childA)).toBe(other);
    expect(getGraphNumChildren(container)).toBe(0);
    expect(getGraphNumChildren(other)).toBe(1);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(getGraphNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    addGraphChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addGraphChild(container, childA);
    expect(called).toBe(true);
  });
});

describe('addGraphChildAt', () => {
  it('addChildAt inserts a child at the given index', () => {
    addGraphChild(container, childA);
    addGraphChildAt(container, childB, 0);

    expect(getGraphNumChildren(container)).toBe(2);
    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('addChildAt allows inserting at the end (index === length)', () => {
    addGraphChild(container, childA);
    addGraphChildAt(container, childB, 1);

    expect(getGraphNumChildren(container)).toBe(2);
    expect(getChildren(container)[1]).toBe(childB);
  });

  it('addChildAt throws if index is negative', () => {
    expect(() => addGraphChildAt(container, childA, -1)).toThrow();
  });

  it('throws if index is out of bounds', () => {
    expect(() => addGraphChildAt(container, childA, 1)).toThrow();
  });

  it('reorders child when added again to the same parent', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    // move childA to the front
    addGraphChildAt(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(getGraphNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    addGraphChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addGraphChildAt(container, childA, 0);
    expect(called).toBe(true);
  });
});

describe('containsGraphChild', () => {
  it('returns false if parent does not contain child', () => {
    expect(containsGraphChild(container, childA)).toBe(false);
  });

  it('returns true if parent does not contain child', () => {
    addGraphChild(container, childA);
    expect(containsGraphChild(container, childA)).toBe(true);
  });

  it('returns true if the child is located deeper in the heirarchy', () => {
    addGraphChild(container, childA);
    addGraphChild(childA, childB);
    expect(containsGraphChild(container, childB)).toBe(true);
  });
});

describe('getGraphChildAt', () => {
  it('returns null if there are no children', () => {
    expect(getGraphChildAt(container, 0)).toBeNull();
  });

  it('returns null if there are no children at the given index', () => {
    addGraphChild(container, childA);
    expect(getGraphChildAt(container, 1)).toBeNull();
    expect(getGraphChildAt(container, -1)).toBeNull();
  });

  it('returns a matching child at the given index', () => {
    addGraphChild(container, childA);
    expect(getGraphChildAt(container, 0)).toStrictEqual(childA);
  });
});

describe('getGraphChildByName', () => {
  it('returns null if there are no children', () => {
    expect(getGraphChildByName(container, 'hello')).toBeNull();
  });

  it('returns null if there are no children with the given name', () => {
    addGraphChild(container, childA);
    childA.name = 'childA';
    expect(getGraphChildByName(container, 'hello')).toBeNull();
  });

  it('returns the first child with the given name', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);
    childA.name = 'hello';
    childB.name = 'hello';
    expect(getGraphChildByName(container, 'hello')).toStrictEqual(childA);
  });

  it('does not iterate through descendents', () => {
    addGraphChild(container, childA);
    addGraphChild(childA, childB);
    childB.name = 'hello';
    expect(getGraphChildByName(container, 'hello')).toBeNull();
  });
});

describe('getGraphChildIndex', () => {
  it('returns -1 if object is not a child', () => {
    expect(getGraphChildIndex(container, childA)).toBe(-1);
  });

  it('returns the index if object is a child', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);
    expect(getGraphChildIndex(container, childA)).toBe(0);
    expect(getGraphChildIndex(container, childB)).toBe(1);
  });

  it('does not iterate through descendents', () => {
    addGraphChild(container, childA);
    addGraphChild(childA, childB);
    expect(getGraphChildIndex(container, childB)).toBe(-1);
  });
});

describe('getGraphNumChildren', () => {
  it('returns 0 if children is null', () => {
    const children = getEntityRuntime(container).children;
    expect(children).toBeNull();
    expect(getGraphNumChildren(container)).toBe(0);
  });

  it('returns length of runtime children array', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);
    const children = getEntityRuntime(container).children;
    expect(getGraphNumChildren(container)).toStrictEqual(children!.length);
  });
});

describe('getGraphParent', () => {
  it('returns runtime parent reference', () => {
    addGraphChild(container, childA);
    const parent = getEntityRuntime(childA).parent;
    expect(getGraphParent(childA)).toStrictEqual(parent);
  });
});

describe('getGraphRoot', () => {
  it('returns the node itself when it has no parent', () => {
    expect(getGraphRoot(childA)).toBe(childA);
  });

  it('returns the topmost ancestor', () => {
    addGraphChild(container, childA);
    addGraphChild(childA, childB);
    expect(getGraphRoot(childB)).toBe(container);
  });

  it('returns the direct parent when depth is one', () => {
    addGraphChild(container, childA);
    expect(getGraphRoot(childA)).toBe(container);
  });
});

describe('removeGraphChild', () => {
  it('removes the child and clears its parent', () => {
    addGraphChild(container, childA);
    expect(getGraphNumChildren(container)).toBe(1);

    removeGraphChild(container, childA);

    expect(getGraphNumChildren(container)).toBe(0);
    expect(getGraphParent(childA)).toBeNull();
  });

  it('does nothing if child is not a child of target', () => {
    addGraphChild(container, childA);

    const other = createGraphNode(TestGraph, NodeKind);
    removeGraphChild(other, childA);

    expect(getGraphNumChildren(container)).toBe(1);
    expect(getGraphParent(childA)).toBe(container);
  });

  it('is safe when child is null', () => {
    expect(() => removeGraphChild(container, null as any)).not.toThrow();
  });

  it('always clears the parent reference', () => {
    addGraphChild(container, childA);
    removeGraphChild(container, childA);

    expect(getGraphParent(childA)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addGraphChild(container, childA);
    let called = false;
    connectSignal(getGraphNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeGraphChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addGraphChild(container, childA);
    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeGraphChild(container, childA);
    expect(called).toBe(true);
  });
});

describe('removeGraphChildAt', () => {
  it('removeChildAt removes and returns the child at index', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    const removed = removeGraphChildAt(container, 0);

    expect(removed).toBe(childA);
    expect(getGraphNumChildren(container)).toBe(1);
    expect(getGraphParent(childA)).toBeNull();
    expect(getChildren(container)[0]).toBe(childB);
  });

  it('removeChildAt returns null for out-of-range index', () => {
    expect(removeGraphChildAt(container, 0)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    let called = false;
    connectSignal(getGraphNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeGraphChildAt(container, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeGraphChildAt(container, 0);
    expect(called).toBe(true);
  });
});

describe('removeGraphChildren', () => {
  it('removeChildren removes all children by default', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    removeGraphChildren(container);

    expect(getGraphNumChildren(container)).toBe(0);
    expect(getGraphParent(childA)).toBeNull();
    expect(getGraphParent(childB)).toBeNull();
  });

  it('removeChildren removes a range of children', () => {
    const childC = createGraphNode(TestGraph, NodeKind);

    addGraphChild(container, childA);
    addGraphChild(container, childB);
    addGraphChild(container, childC);

    removeGraphChildren(container, 1, 2);

    expect(getGraphNumChildren(container)).toBe(1);
    expect(getChildren(container)[0]).toBe(childA);
    expect(getGraphParent(childB)).toBeNull();
    expect(getGraphParent(childC)).toBeNull();
  });

  it('removeChildren does nothing if beginIndex is out of range', () => {
    addGraphChild(container, childA);

    removeGraphChildren(container, 5);

    expect(getGraphNumChildren(container)).toBe(1);
  });

  it('removeChildren throws if indices are invalid', () => {
    addGraphChild(container, childA);

    expect(() => removeGraphChildren(container, 0, 10)).toThrow(RangeError);
    expect(() => removeGraphChildren(container, -1, 0)).toThrow(RangeError);
  });

  it('calls onParentChanged on the child', () => {
    addGraphChild(container, childA);

    let called = false;
    connectSignal(getGraphNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeGraphChildren(container);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addGraphChild(container, childA);

    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeGraphChildren(container);
    expect(called).toBe(true);
  });
});

describe('setGraphChildIndex', () => {
  it('setChildIndex moves an existing child to a new index', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    setGraphChildIndex(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('setChildIndex does nothing if child is not in container', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addGraphChild(other, childA);
    addGraphChild(container, childB);

    setGraphChildIndex(container, childA, 0);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getGraphParent(childA)).toBe(other);
  });

  it('setChildIndex ignores out-of-range indices', () => {
    addGraphChild(container, childA);

    setGraphChildIndex(container, childA, 5);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    setGraphChildIndex(container, childA, 1);
    expect(called).toBe(true);
  });
});

describe('swapChildrenAt', () => {
  it('swapChildrenAt swaps children by index', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    swapChildrenAt(container, 0, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapChildrenAt assumes valid indices (throws if invalid)', () => {
    addGraphChild(container, childA);

    expect(() => swapChildrenAt(container, 0, 1)).toThrow();
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapChildrenAt(container, 0, 1);
    expect(called).toBe(true);
  });
});

describe('swapGraphChildren', () => {
  it('swapChildren swaps two children', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    swapGraphChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapChildren does nothing if either child is not in container', () => {
    const other = createGraphNode(TestGraph, NodeKind);

    addGraphChild(container, childA);
    addGraphChild(other, childB);

    swapGraphChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addGraphChild(container, childA);
    addGraphChild(container, childB);

    let called = false;
    connectSignal(getGraphNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapGraphChildren(container, childA, childB);
    expect(called).toBe(true);
  });
});

const TestGraph: unique symbol = Symbol('TestGraph');
