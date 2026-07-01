import { getEntityRuntime as getRawEntityRuntime } from '@flighthq/entity';
import { cloneMatrix } from '@flighthq/geometry';
import { connectSignal } from '@flighthq/signals';
import type { HasTransform2D, HasTransform2DRuntime, Node, NodeRuntime, NodeTraits } from '@flighthq/types';
import { NodeKind } from '@flighthq/types';

import { initTransform2DRuntimeTrait, initTransform2DTrait } from './hasTransform2d';
import {
  addNodeChild,
  addNodeChildAt,
  addNodeChildren,
  containsNodeChild,
  forEachNodeChild,
  getNodeAncestors,
  getNodeChildAt,
  getNodeChildByName,
  getNodeChildCount,
  getNodeChildIndex,
  getNodeCommonAncestor,
  getNodeParent,
  getNodeRoot,
  isNodeAncestorOf,
  removeNodeChild,
  removeNodeChildAt,
  removeNodeChildren,
  reparentNode,
  replaceNodeChild,
  setNodeChildIndex,
  swapNodeChildren,
  swapNodeChildrenAt,
} from './hierarchy';
import { createNode, enableNodeSignals, getNodeRuntime } from './node';
import { invalidateNodeLocalTransform } from './revision';
import { getNodeWorldTransformMatrix } from './transform2d';

let container: Node<NodeTraits>;
let childA: Node<NodeTraits>;
let childB: Node<NodeTraits>;

beforeEach(() => {
  container = createNode(NodeKind);
  childA = createNode(NodeKind);
  childB = createNode(NodeKind);
});

function getChildren(source: Node) {
  return getNodeRuntime(source).children as Node[];
}

function getEntityRuntime(source: Node) {
  return getNodeRuntime(source) as NodeRuntime;
}

describe('addNodeChild', () => {
  it('addNodeChild adds a child to the end of the list', () => {
    addNodeChild(container, childA);

    expect(getNodeChildCount(container)).toBe(1);
    expect(getNodeParent(childA)).toBe(container);
  });

  it('throws if child is null', () => {
    expect(() => addNodeChild(container, null as any)).toThrow(TypeError);
  });

  it('throws if child is the same as target', () => {
    expect(() => addNodeChild(container, container)).toThrow(TypeError);
  });

  it('removes child from previous parent before adding', () => {
    const other = createNode(NodeKind);

    addNodeChild(other, childA);
    expect(getNodeParent(childA)).toBe(other);

    addNodeChild(container, childA);

    expect(getNodeParent(childA)).toBe(container);
    expect(getNodeChildCount(other)).toBe(0);
    expect(getNodeChildCount(container)).toBe(1);
  });

  it('a child never has more than one parent', () => {
    const other = createNode(NodeKind);

    addNodeChild(container, childA);
    addNodeChild(other, childA);

    expect(getNodeParent(childA)).toBe(other);
    expect(getNodeChildCount(container)).toBe(0);
    expect(getNodeChildCount(other)).toBe(1);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(enableNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    addNodeChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addNodeChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildAdded on the parent with the child', () => {
    let added: unknown;
    connectSignal(enableNodeSignals(container).onChildAdded, (child) => {
      added = child;
    });
    addNodeChild(container, childA);
    expect(added).toBe(childA);
  });

  it('does not call onChildAdded when reordering within the same parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    let called = false;
    connectSignal(enableNodeSignals(container).onChildAdded, () => {
      called = true;
    });
    addNodeChildAt(container, childA, 1);
    expect(called).toBe(false);
  });

  // Compile-time law: Node<Traits> is invariant in Traits, so nodes from different trait
  // families cannot be mixed in one graph. The @ts-expect-error is the assertion — if the
  // wall ever collapses (e.g. Traits leaks to `any`), this line stops erroring and the test
  // fails to compile under `npm run typecheck`.
  it('rejects mixing nodes from different trait families', () => {
    interface FooTraits {
      foo: number;
    }
    interface BarTraits {
      bar: number;
    }

    const foo = createNode<FooTraits>('FooNode');
    const foo2 = createNode<FooTraits>('FooNode');
    const added = addNodeChild(foo, foo2);
    expect(added).toBe(foo2);

    const bar = createNode<BarTraits>('BarNode');
    // @ts-expect-error a node from a different trait family does not unify with foo's family
    addNodeChild(foo, bar);
  });
});

describe('addNodeChildAt', () => {
  it('addNodeChildAt inserts a child at the given index', () => {
    addNodeChild(container, childA);
    addNodeChildAt(container, childB, 0);

    expect(getNodeChildCount(container)).toBe(2);
    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('addNodeChildAt allows inserting at the end (index === length)', () => {
    addNodeChild(container, childA);
    addNodeChildAt(container, childB, 1);

    expect(getNodeChildCount(container)).toBe(2);
    expect(getChildren(container)[1]).toBe(childB);
  });

  it('addNodeChildAt throws if index is negative', () => {
    expect(() => addNodeChildAt(container, childA, -1)).toThrow();
  });

  it('throws if index is out of bounds', () => {
    expect(() => addNodeChildAt(container, childA, 1)).toThrow();
  });

  it('reorders child when added again to the same parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    // move childA to the front
    addNodeChildAt(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('calls onParentChanged on the child', () => {
    let called = false;
    connectSignal(enableNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    addNodeChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    addNodeChildAt(container, childA, 0);
    expect(called).toBe(true);
  });

  it('calls onChildAdded on the parent with the child', () => {
    let added: unknown;
    connectSignal(enableNodeSignals(container).onChildAdded, (child) => {
      added = child;
    });
    addNodeChildAt(container, childA, 0);
    expect(added).toBe(childA);
  });
});

describe('addNodeChildren', () => {
  it('adds multiple children in order', () => {
    addNodeChildren(container, childA, childB);
    expect(getNodeChildCount(container)).toBe(2);
    expect(getNodeChildAt(container, 0)).toBe(childA);
    expect(getNodeChildAt(container, 1)).toBe(childB);
  });

  it('is a no-op with no children', () => {
    addNodeChildren(container);
    expect(getNodeChildCount(container)).toBe(0);
  });

  it('sets the parent on each child', () => {
    addNodeChildren(container, childA, childB);
    expect(getNodeParent(childA)).toBe(container);
    expect(getNodeParent(childB)).toBe(container);
  });
});

describe('containsNodeChild', () => {
  it('returns false if parent does not contain child', () => {
    expect(containsNodeChild(container, childA)).toBe(false);
  });

  it('returns true if parent does not contain child', () => {
    addNodeChild(container, childA);
    expect(containsNodeChild(container, childA)).toBe(true);
  });

  it('returns true if the child is located deeper in the heirarchy', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(containsNodeChild(container, childB)).toBe(true);
  });
});

describe('forEachNodeChild', () => {
  it('does not call callback when there are no children', () => {
    let called = false;
    forEachNodeChild(container, () => {
      called = true;
    });
    expect(called).toBe(false);
  });

  it('visits each child with its index', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const visited: Array<[Node<NodeTraits>, number]> = [];
    forEachNodeChild(container, (child, index) => {
      visited.push([child, index]);
    });
    expect(visited).toEqual([
      [childA, 0],
      [childB, 1],
    ]);
  });

  it('stops early when callback returns false', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const visited: Node<NodeTraits>[] = [];
    forEachNodeChild(container, (child) => {
      visited.push(child);
      return false;
    });
    expect(visited).toHaveLength(1);
    expect(visited[0]).toBe(childA);
  });
});

describe('getNodeAncestors', () => {
  it('returns an empty array for a root node', () => {
    expect(getNodeAncestors(container)).toEqual([]);
  });

  it('returns [parent] for a direct child', () => {
    addNodeChild(container, childA);
    expect(getNodeAncestors(childA)).toEqual([container]);
  });

  it('returns ancestors from parent toward root', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(getNodeAncestors(childB)).toEqual([childA, container]);
  });
});

describe('getNodeChildAt', () => {
  it('returns null if there are no children', () => {
    expect(getNodeChildAt(container, 0)).toBeNull();
  });

  it('returns null if there are no children at the given index', () => {
    addNodeChild(container, childA);
    expect(getNodeChildAt(container, 1)).toBeNull();
    expect(getNodeChildAt(container, -1)).toBeNull();
  });

  it('returns a matching child at the given index', () => {
    addNodeChild(container, childA);
    expect(getNodeChildAt(container, 0)).toStrictEqual(childA);
  });
});

describe('getNodeChildByName', () => {
  it('returns null if there are no children', () => {
    expect(getNodeChildByName(container, 'hello')).toBeNull();
  });

  it('returns null if there are no children with the given name', () => {
    addNodeChild(container, childA);
    childA.name = 'childA';
    expect(getNodeChildByName(container, 'hello')).toBeNull();
  });

  it('returns the first child with the given name', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    childA.name = 'hello';
    childB.name = 'hello';
    expect(getNodeChildByName(container, 'hello')).toStrictEqual(childA);
  });

  it('does not iterate through descendents', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    childB.name = 'hello';
    expect(getNodeChildByName(container, 'hello')).toBeNull();
  });
});

describe('getNodeChildCount', () => {
  it('returns 0 if children is null', () => {
    const children = getEntityRuntime(container).children;
    expect(children).toBeNull();
    expect(getNodeChildCount(container)).toBe(0);
  });

  it('returns length of runtime children array', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const children = getEntityRuntime(container).children;
    expect(getNodeChildCount(container)).toStrictEqual(children!.length);
  });
});

describe('getNodeChildIndex', () => {
  it('returns -1 if object is not a child', () => {
    expect(getNodeChildIndex(container, childA)).toBe(-1);
  });

  it('returns the index if object is a child', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    expect(getNodeChildIndex(container, childA)).toBe(0);
    expect(getNodeChildIndex(container, childB)).toBe(1);
  });

  it('does not iterate through descendents', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(getNodeChildIndex(container, childB)).toBe(-1);
  });
});

describe('getNodeCommonAncestor', () => {
  it('returns null for nodes in different trees', () => {
    const other = createNode(NodeKind);
    expect(getNodeCommonAncestor(container, other)).toBeNull();
  });

  it('returns the parent when both nodes are its children', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    expect(getNodeCommonAncestor(childA, childB)).toBe(container);
  });

  it('returns the ancestor when one node is the ancestor of the other', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(getNodeCommonAncestor(container, childB)).toBe(container);
  });

  it('returns the node itself when both nodes are the same', () => {
    addNodeChild(container, childA);
    expect(getNodeCommonAncestor(childA, childA)).toBe(childA);
  });
});

describe('getNodeParent', () => {
  it('returns runtime parent reference', () => {
    addNodeChild(container, childA);
    const parent = getEntityRuntime(childA).parent;
    expect(getNodeParent(childA)).toStrictEqual(parent);
  });
});

describe('getNodeRoot', () => {
  it('returns the node itself when it has no parent', () => {
    expect(getNodeRoot(childA)).toBe(childA);
  });

  it('returns the topmost ancestor', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(getNodeRoot(childB)).toBe(container);
  });

  it('returns the direct parent when depth is one', () => {
    addNodeChild(container, childA);
    expect(getNodeRoot(childA)).toBe(container);
  });
});

describe('isNodeAncestorOf', () => {
  it('returns true when a node is an ancestor', () => {
    addNodeChild(container, childA);
    addNodeChild(childA, childB);
    expect(isNodeAncestorOf(container, childB)).toBe(true);
  });

  it('returns true when checking a node against itself', () => {
    expect(isNodeAncestorOf(container, container)).toBe(true);
  });

  it('returns false when there is no ancestor relationship', () => {
    addNodeChild(container, childA);
    expect(isNodeAncestorOf(childA, container)).toBe(false);
  });

  it('returns false for unrelated nodes', () => {
    const other = createNode(NodeKind);
    expect(isNodeAncestorOf(container, other)).toBe(false);
  });
});

describe('removeNodeChild', () => {
  it('removes the child and clears its parent', () => {
    addNodeChild(container, childA);
    expect(getNodeChildCount(container)).toBe(1);

    removeNodeChild(container, childA);

    expect(getNodeChildCount(container)).toBe(0);
    expect(getNodeParent(childA)).toBeNull();
  });

  it('does nothing if child is not a child of target', () => {
    addNodeChild(container, childA);

    const other = createNode(NodeKind);
    removeNodeChild(other, childA);

    expect(getNodeChildCount(container)).toBe(1);
    expect(getNodeParent(childA)).toBe(container);
  });

  it('is safe when child is null', () => {
    expect(() => removeNodeChild(container, null as any)).not.toThrow();
  });

  it('always clears the parent reference', () => {
    addNodeChild(container, childA);
    removeNodeChild(container, childA);

    expect(getNodeParent(childA)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addNodeChild(container, childA);
    let called = false;
    connectSignal(enableNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeNodeChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addNodeChild(container, childA);
    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeNodeChild(container, childA);
    expect(called).toBe(true);
  });

  it('calls onChildRemoved on the parent with the child', () => {
    addNodeChild(container, childA);
    let removed: unknown;
    connectSignal(enableNodeSignals(container).onChildRemoved, (child) => {
      removed = child;
    });
    removeNodeChild(container, childA);
    expect(removed).toBe(childA);
  });
});

describe('removeNodeChildAt', () => {
  it('removeNodeChildAt removes and returns the child at index', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    const removed = removeNodeChildAt(container, 0);

    expect(removed).toBe(childA);
    expect(getNodeChildCount(container)).toBe(1);
    expect(getNodeParent(childA)).toBeNull();
    expect(getChildren(container)[0]).toBe(childB);
  });

  it('removeNodeChildAt returns null for out-of-range index', () => {
    expect(removeNodeChildAt(container, 0)).toBeNull();
  });

  it('calls onParentChanged on the child', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    let called = false;
    connectSignal(enableNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeNodeChildAt(container, 0);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeNodeChildAt(container, 0);
    expect(called).toBe(true);
  });
});

describe('removeNodeChildren', () => {
  it('removeChildren removes all children by default', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    removeNodeChildren(container);

    expect(getNodeChildCount(container)).toBe(0);
    expect(getNodeParent(childA)).toBeNull();
    expect(getNodeParent(childB)).toBeNull();
  });

  it('removeChildren removes a range of children', () => {
    const childC = createNode(NodeKind);

    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(container, childC);

    removeNodeChildren(container, 1, 2);

    expect(getNodeChildCount(container)).toBe(1);
    expect(getChildren(container)[0]).toBe(childA);
    expect(getNodeParent(childB)).toBeNull();
    expect(getNodeParent(childC)).toBeNull();
  });

  it('removeChildren does nothing if beginIndex is out of range', () => {
    addNodeChild(container, childA);

    removeNodeChildren(container, 5);

    expect(getNodeChildCount(container)).toBe(1);
  });

  it('removeChildren throws if indices are invalid', () => {
    addNodeChild(container, childA);

    expect(() => removeNodeChildren(container, 0, 10)).toThrow(RangeError);
    expect(() => removeNodeChildren(container, -1, 0)).toThrow(RangeError);
  });

  it('calls onParentChanged on the child', () => {
    addNodeChild(container, childA);

    let called = false;
    connectSignal(enableNodeSignals(childA).onParentChanged, () => {
      called = true;
    });
    removeNodeChildren(container);
    expect(called).toBe(true);
  });

  it('calls onChildrenChanged on the parent', () => {
    addNodeChild(container, childA);

    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenChanged, () => {
      called = true;
    });
    removeNodeChildren(container);
    expect(called).toBe(true);
  });
});

describe('reparentNode', () => {
  type TransformNode = Node<HasTransform2D> & HasTransform2D;
  const TransformKind = 'TransformTest';

  function createTransformNode(): TransformNode {
    const node = createNode(TransformKind) as TransformNode;
    const runtime = getRawEntityRuntime(node);
    initTransform2DTrait(node);
    initTransform2DRuntimeTrait(runtime as HasTransform2DRuntime);
    return node;
  }

  it('preserves world position after reparenting', () => {
    const parentA = createTransformNode();
    parentA.x = 100;
    parentA.y = 50;
    parentA.rotation = 30;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 20;
    child.y = 10;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const parentB = createTransformNode();
    parentB.x = 200;
    parentB.y = 100;
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });

  it('preserves world position with scaled parents', () => {
    const parentA = createTransformNode();
    parentA.scaleX = 2;
    parentA.scaleY = 2;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 10;
    child.y = 10;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const parentB = createTransformNode();
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });

  it('preserves skewX and skewY values', () => {
    const parentA = createTransformNode();
    parentA.x = 50;
    parentA.rotation = 45;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 10;
    child.skewX = 15;
    child.skewY = 20;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const parentB = createTransformNode();
    parentB.x = 100;
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);

    expect(child.skewX).toBe(15);
    expect(child.skewY).toBe(20);
  });

  it('preserves world position with pivot', () => {
    const parentA = createTransformNode();
    parentA.x = 100;
    parentA.rotation = 45;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 30;
    child.y = 20;
    child.pivotX = 50;
    child.pivotY = 50;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const parentB = createTransformNode();
    parentB.x = 200;
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });

  it('preserves world position when reparenting a root node', () => {
    const child = createTransformNode();
    child.x = 80;
    child.y = 40;
    child.rotation = 60;
    child.scaleX = 1.5;
    invalidateNodeLocalTransform(child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const parentB = createTransformNode();
    parentB.x = 50;
    parentB.y = 25;
    parentB.rotation = 10;
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });

  it('preserves world position with reflected scale', () => {
    const parentA = createTransformNode();
    parentA.scaleX = -1;
    parentA.scaleY = 1;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 30;
    child.y = 20;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const parentB = createTransformNode();
    parentB.x = 100;
    invalidateNodeLocalTransform(parentB);

    reparentNode(child, parentB);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });

  it('produces matching local TRS when reparented to identity parent', () => {
    const parentA = createTransformNode();
    parentA.x = 100;
    parentA.y = 50;
    parentA.rotation = 45;
    parentA.scaleX = 2;
    parentA.scaleY = 3;
    invalidateNodeLocalTransform(parentA);

    const child = createTransformNode();
    child.x = 10;
    child.y = 5;
    invalidateNodeLocalTransform(child);
    addNodeChild(parentA, child);

    const before = cloneMatrix(getNodeWorldTransformMatrix(child));

    const identityParent = createTransformNode();
    invalidateNodeLocalTransform(identityParent);

    reparentNode(child, identityParent);
    const after = getNodeWorldTransformMatrix(child);

    expect(after.a).toBeCloseTo(before.a, 10);
    expect(after.b).toBeCloseTo(before.b, 10);
    expect(after.c).toBeCloseTo(before.c, 10);
    expect(after.d).toBeCloseTo(before.d, 10);
    expect(after.tx).toBeCloseTo(before.tx, 10);
    expect(after.ty).toBeCloseTo(before.ty, 10);
  });
});

describe('replaceNodeChild', () => {
  it('replaces oldChild with newChild at the same index', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const childC = createNode(NodeKind);
    replaceNodeChild(container, childA, childC);
    expect(getNodeChildAt(container, 0)).toBe(childC);
    expect(getNodeChildAt(container, 1)).toBe(childB);
    expect(getNodeParent(childA)).toBeNull();
  });

  it('is a no-op when oldChild is not in target', () => {
    addNodeChild(container, childA);
    replaceNodeChild(container, childB, childA);
    expect(getNodeChildCount(container)).toBe(1);
    expect(getNodeChildAt(container, 0)).toBe(childA);
  });

  it('sets the parent of newChild to target', () => {
    addNodeChild(container, childA);
    replaceNodeChild(container, childA, childB);
    expect(getNodeParent(childB)).toBe(container);
  });
});

describe('setNodeChildIndex', () => {
  it('setChildIndex moves an existing child to a new index', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    setNodeChildIndex(container, childA, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('setChildIndex does nothing if child is not in container', () => {
    const other = createNode(NodeKind);

    addNodeChild(other, childA);
    addNodeChild(container, childB);

    setNodeChildIndex(container, childA, 0);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getNodeParent(childA)).toBe(other);
  });

  it('setChildIndex ignores out-of-range indices', () => {
    addNodeChild(container, childA);

    setNodeChildIndex(container, childA, 5);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    setNodeChildIndex(container, childA, 1);
    expect(called).toBe(true);
  });
});

describe('swapNodeChildren', () => {
  it('swapNodeChildren swaps two children', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    swapNodeChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapNodeChildren does nothing if either child is not in container', () => {
    const other = createNode(NodeKind);

    addNodeChild(container, childA);
    addNodeChild(other, childB);

    swapNodeChildren(container, childA, childB);

    expect(getChildren(container)[0]).toBe(childA);
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapNodeChildren(container, childA, childB);
    expect(called).toBe(true);
  });
});

describe('swapNodeChildrenAt', () => {
  it('swapNodeChildrenAt swaps children by index', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    swapNodeChildrenAt(container, 0, 1);

    expect(getChildren(container)[0]).toBe(childB);
    expect(getChildren(container)[1]).toBe(childA);
  });

  it('swapNodeChildrenAt assumes valid indices (throws if invalid)', () => {
    addNodeChild(container, childA);

    expect(() => swapNodeChildrenAt(container, 0, 1)).toThrow();
  });

  it('calls onChildrenOrderChanged on the parent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);

    let called = false;
    connectSignal(enableNodeSignals(container).onChildrenOrderChanged, () => {
      called = true;
    });
    swapNodeChildrenAt(container, 0, 1);
    expect(called).toBe(true);
  });
});
