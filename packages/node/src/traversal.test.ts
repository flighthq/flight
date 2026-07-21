import type { Node, NodeTraits } from '@flighthq/types';
import { NodeKind } from '@flighthq/types';

import { addNodeChild } from './hierarchy';
import { createNode } from './node';
import {
  findNode,
  findNodeByName,
  forEachNodeAncestor,
  forEachNodeDescendant,
  getNodeChildren,
  getNodeDepth,
  getNodeNextSibling,
  getNodePreviousSibling,
  walkNodeDescendants,
} from './traversal';

let root: Node<NodeTraits>;
let childA: Node<NodeTraits>;
let childB: Node<NodeTraits>;
let grandchild: Node<NodeTraits>;

beforeEach(() => {
  root = createNode(NodeKind);
  root.name = 'root';
  childA = createNode(NodeKind);
  childA.name = 'childA';
  childB = createNode(NodeKind);
  childB.name = 'childB';
  grandchild = createNode(NodeKind);
  grandchild.name = 'grandchild';

  addNodeChild(root, childA);
  addNodeChild(root, childB);
  addNodeChild(childA, grandchild);
});

describe('findNode', () => {
  it('returns null for a leaf with no children', () => {
    expect(findNode(grandchild, () => true)).toBeNull();
  });

  it('returns null when predicate never matches', () => {
    expect(findNode(root, () => false)).toBeNull();
  });

  it('finds a direct child matching the predicate', () => {
    const result = findNode(root, (n) => n.name === 'childA');
    expect(result).toBe(childA);
  });

  it('finds a deep descendant matching the predicate', () => {
    const result = findNode(root, (n) => n.name === 'grandchild');
    expect(result).toBe(grandchild);
  });

  it('returns the first matching descendant in depth-first order', () => {
    childB.name = 'childA'; // duplicate name
    const result = findNode(root, (n) => n.name === 'childA');
    // childA appears before childB in DFS
    expect(result).toBe(childA);
  });

  it('does not include the source node itself', () => {
    const result = findNode(root, (n) => n === root);
    expect(result).toBeNull();
  });

  it('narrows the result to the guarded type when the predicate is a type guard', () => {
    interface TaggedNode extends Node<NodeTraits> {
      tag: string;
    }
    const isTagged = (n: Node<NodeTraits>): n is TaggedNode => (n as Partial<TaggedNode>).tag === 'tagged';
    (childA as TaggedNode).tag = 'tagged';
    const result = findNode(root, isTagged);
    // Compile-time proof of the guard overload: `result` is `TaggedNode | null`, so reading `.tag`
    // needs no cast. Would not typecheck if findNode returned the un-narrowed NodeOf.
    expect(result?.tag).toBe('tagged');
    expect(result).toBe(childA);
  });
});

describe('findNodeByName', () => {
  it('returns null when no descendant has the given name', () => {
    expect(findNodeByName(root, 'missing')).toBeNull();
  });

  it('finds a direct child by name', () => {
    expect(findNodeByName(root, 'childA')).toBe(childA);
  });

  it('finds a deep descendant by name', () => {
    expect(findNodeByName(root, 'grandchild')).toBe(grandchild);
  });

  it('does not find the source node itself', () => {
    expect(findNodeByName(root, 'root')).toBeNull();
  });
});

describe('forEachNodeAncestor', () => {
  it('does not call callback for a root node', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeAncestor(root, (n) => {
      visited.push(n);
      return true;
    });
    expect(visited).toHaveLength(0);
  });

  it('visits ancestors from parent toward root', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeAncestor(grandchild, (n) => {
      visited.push(n);
      return true;
    });
    expect(visited).toEqual([childA, root]);
  });

  it('stops early when callback returns false', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeAncestor(grandchild, (n) => {
      visited.push(n);
      return false; // stop after first
    });
    expect(visited).toEqual([childA]);
  });
});

describe('forEachNodeDescendant', () => {
  it('does not call callback for a leaf node', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeDescendant(grandchild, (n) => visited.push(n));
    expect(visited).toHaveLength(0);
  });

  it('visits all descendants in depth-first pre-order', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeDescendant(root, (n) => visited.push(n));
    expect(visited).toEqual([childA, grandchild, childB]);
  });

  it('does not include the source node', () => {
    const visited: Node<NodeTraits>[] = [];
    forEachNodeDescendant(root, (n) => visited.push(n));
    expect(visited).not.toContain(root);
  });
});

describe('getNodeChildren', () => {
  it('returns an empty array for a node with no children', () => {
    expect(getNodeChildren(grandchild)).toEqual([]);
  });

  it('returns a snapshot of direct children', () => {
    const children = getNodeChildren(root);
    expect(children).toEqual([childA, childB]);
  });

  it('returns a copy that does not reflect subsequent mutations', () => {
    const snapshot = getNodeChildren(root);
    const extra = createNode(NodeKind);
    addNodeChild(root, extra);
    expect(snapshot).toHaveLength(2);
  });
});

describe('getNodeDepth', () => {
  it('returns 0 for a root node', () => {
    expect(getNodeDepth(root)).toBe(0);
  });

  it('returns 1 for a direct child of the root', () => {
    expect(getNodeDepth(childA)).toBe(1);
  });

  it('returns the correct depth for a deeper node', () => {
    expect(getNodeDepth(grandchild)).toBe(2);
  });
});

describe('getNodeNextSibling', () => {
  it('returns null for a root node', () => {
    expect(getNodeNextSibling(root)).toBeNull();
  });

  it('returns null for the last child', () => {
    expect(getNodeNextSibling(childB)).toBeNull();
  });

  it('returns the next sibling', () => {
    expect(getNodeNextSibling(childA)).toBe(childB);
  });
});

describe('getNodePreviousSibling', () => {
  it('returns null for a root node', () => {
    expect(getNodePreviousSibling(root)).toBeNull();
  });

  it('returns null for the first child', () => {
    expect(getNodePreviousSibling(childA)).toBeNull();
  });

  it('returns the previous sibling', () => {
    expect(getNodePreviousSibling(childB)).toBe(childA);
  });
});

describe('walkNodeDescendants', () => {
  it('returns true when no children are present', () => {
    expect(walkNodeDescendants(grandchild, () => true)).toBe(true);
  });

  it('visits all descendants in depth-first pre-order when visitor always returns true', () => {
    const visited: Node<NodeTraits>[] = [];
    const result = walkNodeDescendants(root, (n) => {
      visited.push(n);
      return true;
    });
    expect(result).toBe(true);
    expect(visited).toEqual([childA, grandchild, childB]);
  });

  it('stops early and returns false when visitor returns false', () => {
    const visited: Node<NodeTraits>[] = [];
    const result = walkNodeDescendants(root, (n) => {
      visited.push(n);
      return false; // stop at first node
    });
    expect(result).toBe(false);
    expect(visited).toHaveLength(1);
    expect(visited[0]).toBe(childA);
  });

  it('does not visit subtree when visitor returns false for a parent', () => {
    const visited: Node<NodeTraits>[] = [];
    walkNodeDescendants(root, (n) => {
      visited.push(n);
      // Stop when we reach childA — its subtree (grandchild) should be skipped
      return n !== childA;
    });
    expect(visited).not.toContain(grandchild);
    expect(visited).not.toContain(childB);
  });
});
