import { connectSignal } from '@flighthq/signals/contract';
import type { Node, NodeTraits } from '@flighthq/types/contract';
import { NodeKind } from '@flighthq/types/contract';

import { addNodeChild, removeNodeChild } from './hierarchy';
import { createNode, enableNodeSignals, getNodeRuntime } from './node';
import {
  addNodeOrderListEntry,
  applyNodeOrderList,
  clearNodeOrderList,
  createNodeOrderList,
  disposeNodeOrderList,
  forEachNodeOrderListEntry,
  getNodeOrderListEntrySortKey,
  hasNodeOrderListEntry,
  initializeNodeOrderList,
  removeNodeOrderListEntry,
  setNodeOrderListEntry,
  setNodeOrderListEntryAbove,
  setNodeOrderListEntryBelow,
  setNodeOrderListFromNodeChildren,
  swapNodeOrderListEntries,
} from './nodeOrderList';
import { getNodeChildrenRevision } from './revision';

let container: Node<NodeTraits>;
let childA: Node<NodeTraits>;
let childB: Node<NodeTraits>;
let childC: Node<NodeTraits>;

beforeEach(() => {
  container = createNode(NodeKind);
  childA = createNode(NodeKind);
  childB = createNode(NodeKind);
  childC = createNode(NodeKind);
});

function getChildren(source: Node) {
  return getNodeRuntime(source).children as Node[];
}

function expectChildren(source: Node, expected: readonly Node[]): void {
  const actual = getChildren(source);
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBe(expected[i]);
}

function attachAll() {
  addNodeChild(container, childA);
  addNodeChild(container, childB);
  addNodeChild(container, childC);
}

describe('addNodeOrderListEntry', () => {
  it('appends entries into the valid window', () => {
    const list = createNodeOrderList();

    addNodeOrderListEntry(list, childA, 5);
    addNodeOrderListEntry(list, childB, 2);

    expect(list.entryCount).toBe(2);
    expect(list.nodes[0]).toBe(childA);
    expect(list.sortKeys[0]).toBe(5);
    expect(list.nodes[1]).toBe(childB);
    expect(list.sortKeys[1]).toBe(2);
  });

  it('reuses capacity after a clear rather than growing the arrays', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);
    clearNodeOrderList(list);

    addNodeOrderListEntry(list, childC, 3);

    expect(list.entryCount).toBe(1);
    expect(list.nodes.length).toBe(2);
    expect(list.nodes[0]).toBe(childC);
  });

  it('allows a node to be entered twice', () => {
    const list = createNodeOrderList();

    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childA, 2);

    expect(list.entryCount).toBe(2);
  });
});

describe('applyNodeOrderList', () => {
  it('permutes members into ascending sort-key order', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);

    applyNodeOrderList(container, list);

    expectChildren(container, [childC, childB, childA]);
  });

  it('never moves a child the list does not name', () => {
    const foreign = createNode(NodeKind);
    addNodeChild(container, childA);
    addNodeChild(container, foreign);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 20);
    addNodeOrderListEntry(list, childB, 10);

    applyNodeOrderList(container, list);

    // The members swap across the slots they held (0 and 2); the foreign child keeps slot 1, so it
    // still sits between them rather than being compacted to one side.
    expectChildren(container, [childB, foreign, childA]);
  });

  it('ignores entries that are not children of the target', () => {
    const stranger = createNode(NodeKind);
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, stranger, 20);
    addNodeOrderListEntry(list, childB, 10);

    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA]);
  });

  it('ignores entries attached to a different parent', () => {
    const other = createNode(NodeKind);
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(other, childC);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childC, 20);
    addNodeOrderListEntry(list, childB, 10);

    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA]);
    expectChildren(other, [childC]);
  });

  it('is a no-op once every member has been removed', () => {
    const foreign = createNode(NodeKind);
    addNodeChild(container, childA);
    addNodeChild(container, foreign);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 20);
    addNodeOrderListEntry(list, childB, 10);
    removeNodeChild(container, childA);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, list);

    expectChildren(container, [foreign]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('sorts the survivors when only some members were removed', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);
    removeNodeChild(container, childB);

    applyNodeOrderList(container, list);

    expectChildren(container, [childC, childA]);
  });

  it('breaks equal sort keys by the order the entries were added', () => {
    addNodeChild(container, childC);
    addNodeChild(container, childB);
    addNodeChild(container, childA);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 7);
    addNodeOrderListEntry(list, childB, 7);
    addNodeOrderListEntry(list, childC, 7);

    applyNodeOrderList(container, list);

    expectChildren(container, [childA, childB, childC]);
  });

  it('resolves a node entered twice to its last entry', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 10);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childA, 30);

    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA]);
  });

  it('is idempotent', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 20);
    addNodeOrderListEntry(list, childB, 10);
    applyNodeOrderList(container, list);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('advances the children revision once for the whole permutation', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, list);

    expect(getNodeChildrenRevision(container)).toBe((revision + 1) >>> 0);
  });

  it('calls onChildrenOrderChanged on the parent once', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);
    let calls = 0;
    connectSignal(enableNodeSignals(container).onChildrenOrderChanged, () => {
      calls++;
    });

    applyNodeOrderList(container, list);

    expect(calls).toBe(1);
  });

  it('does not signal when nothing moved', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 10);
    addNodeOrderListEntry(list, childB, 20);
    let calls = 0;
    connectSignal(enableNodeSignals(container).onChildrenOrderChanged, () => {
      calls++;
    });

    applyNodeOrderList(container, list);

    expect(calls).toBe(0);
  });

  it('leaves an empty list alone', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, createNodeOrderList());

    expectChildren(container, [childA, childB]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('leaves a childless target alone when the list is nonempty', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    expect(() => applyNodeOrderList(container, list)).not.toThrow();
    expect(getNodeRuntime(container).children).toBeNull();
  });

  it('does not apply retained entries outside the valid window', () => {
    addNodeChild(container, childC);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childC, 10);
    addNodeOrderListEntry(list, childB, 0);
    clearNodeOrderList(list);
    addNodeOrderListEntry(list, childC, 10);

    applyNodeOrderList(container, list);

    expectChildren(container, [childC, childB]);
  });
});

describe('clearNodeOrderList', () => {
  it('empties the valid window but keeps capacity', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    clearNodeOrderList(list);

    expect(list.entryCount).toBe(0);
    expect(list.nodes.length).toBe(1);
  });
});

describe('createNodeOrderList', () => {
  it('creates an empty list', () => {
    const list = createNodeOrderList();

    expect(list.entryCount).toBe(0);
    expect(list.nodes).toEqual([]);
    expect(list.sortKeys).toEqual([]);
  });
});

describe('disposeNodeOrderList', () => {
  it('releases the node references clear deliberately retains', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);

    disposeNodeOrderList(list);

    expect(list.entryCount).toBe(0);
    expect(list.nodes.length).toBe(0);
    expect(list.sortKeys.length).toBe(0);
  });

  it('leaves the list usable', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    disposeNodeOrderList(list);

    addNodeOrderListEntry(list, childB, 4);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childB)).toBe(4);
  });
});

describe('forEachNodeOrderListEntry', () => {
  it('visits every entry in entry order', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 10);
    const seen: [Node, number, number][] = [];

    forEachNodeOrderListEntry(list, (node, sortKey, index) => {
      seen.push([node, sortKey, index]);
    });

    expect(seen).toEqual([
      [childA, 30, 0],
      [childB, 10, 1],
    ]);
  });

  it('stops early when the callback returns false', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);
    let visits = 0;

    forEachNodeOrderListEntry(list, () => {
      visits++;
      return false;
    });

    expect(visits).toBe(1);
  });

  it('does not visit entries past the valid window', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);
    clearNodeOrderList(list);
    addNodeOrderListEntry(list, childC, 3);
    let visits = 0;

    forEachNodeOrderListEntry(list, () => {
      visits++;
    });

    expect(visits).toBe(1);
  });
});

describe('getNodeOrderListEntrySortKey', () => {
  it('returns the sort key a node is entered with', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, -4);

    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(-4);
  });

  it('returns null rather than -1 for a node with no entry', () => {
    const list = createNodeOrderList();

    expect(getNodeOrderListEntrySortKey(list, childA)).toBeNull();
  });

  it('reports the winning entry when a node is entered twice', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childA, 9);

    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(9);
  });
});

describe('hasNodeOrderListEntry', () => {
  it('reports whether a node is entered', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    expect(hasNodeOrderListEntry(list, childA)).toBe(true);
    expect(hasNodeOrderListEntry(list, childB)).toBe(false);
  });

  it('does not see entries past the valid window', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    clearNodeOrderList(list);

    expect(hasNodeOrderListEntry(list, childA)).toBe(false);
  });
});

describe('initializeNodeOrderList', () => {
  it('is the construction initializer of createNodeOrderList', () => {
    expect(typeof initializeNodeOrderList).toBe('function');
  });
});

describe('removeNodeOrderListEntry', () => {
  it('removes the entry and reports that it did', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);

    expect(removeNodeOrderListEntry(list, childA)).toBe(true);
    expect(list.entryCount).toBe(1);
    expect(hasNodeOrderListEntry(list, childA)).toBe(false);
    expect(getNodeOrderListEntrySortKey(list, childB)).toBe(2);
  });

  it('reports false for a node with no entry', () => {
    const list = createNodeOrderList();

    expect(removeNodeOrderListEntry(list, childA)).toBe(false);
  });

  it('shifts the remaining entries down so tie order survives', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 7);
    addNodeOrderListEntry(list, childC, 7);
    addNodeOrderListEntry(list, childB, 7);
    removeNodeOrderListEntry(list, childA);

    applyNodeOrderList(container, list);

    // A keeps slot 0 — only its entry was removed, not the child. C was entered before B and stays
    // before it; a swap-with-last removal would have put B first and left the children untouched.
    expectChildren(container, [childA, childC, childB]);
  });
});

describe('setNodeOrderListEntry', () => {
  it('enters a node that has no entry', () => {
    const list = createNodeOrderList();

    setNodeOrderListEntry(list, childA, 3);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(3);
  });

  it('re-keys in place rather than adding a second entry', () => {
    const list = createNodeOrderList();
    setNodeOrderListEntry(list, childA, 3);

    setNodeOrderListEntry(list, childA, 8);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(8);
  });
});

describe('setNodeOrderListEntryAbove', () => {
  it('places a node immediately above the target', () => {
    attachAll();
    const list = createNodeOrderList();
    setNodeOrderListFromNodeChildren(list, container);

    setNodeOrderListEntryAbove(list, childA, childC);
    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childC, childA]);
  });

  it('places between neighbours whose keys leave no gap', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childB, 5);
    addNodeOrderListEntry(list, childC, 6);

    setNodeOrderListEntryAbove(list, childA, childB);

    expect(list.entryCount).toBe(3);
    expect(list.nodes).toHaveLength(3);
    expect(list.sortKeys).toHaveLength(3);
    expect(list.nodes[0]).toBe(childB);
    expect(list.nodes[1]).toBe(childA);
    expect(list.nodes[2]).toBe(childC);
    expect(list.sortKeys.slice(0, 3)).toEqual([5, 5, 6]);

    applyNodeOrderList(container, list);

    // No midpoint exists between 5 and 6, so bisection could not express this; the equal-key plus
    // entry-position rule can.
    expectChildren(container, [childB, childA, childC]);
  });

  it('moves a node that is already entered rather than duplicating it', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childC, 9);

    setNodeOrderListEntryAbove(list, childA, childC);

    expect(list.entryCount).toBe(2);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(9);
  });

  it('does nothing when the target has no entry', () => {
    const list = createNodeOrderList();

    setNodeOrderListEntryAbove(list, childA, childC);

    expect(list.entryCount).toBe(0);
  });

  it('keeps an existing node entry when the target has no entry', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 4);

    setNodeOrderListEntryAbove(list, childA, childC);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(4);
  });

  it('does nothing when the node is its own target', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 4);

    setNodeOrderListEntryAbove(list, childA, childA);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(4);
  });
});

describe('setNodeOrderListEntryBelow', () => {
  it('places a node immediately below the target', () => {
    attachAll();
    const list = createNodeOrderList();
    setNodeOrderListFromNodeChildren(list, container);

    setNodeOrderListEntryBelow(list, childA, childC);
    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA, childC]);
  });

  it('places between neighbours whose keys leave no gap', () => {
    attachAll();
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childB, 5);
    addNodeOrderListEntry(list, childC, 6);

    setNodeOrderListEntryBelow(list, childA, childC);
    applyNodeOrderList(container, list);

    expectChildren(container, [childB, childA, childC]);
  });

  it('does nothing when the target has no entry', () => {
    const list = createNodeOrderList();

    setNodeOrderListEntryBelow(list, childA, childC);

    expect(list.entryCount).toBe(0);
  });

  it('keeps an existing node entry when the target has no entry', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 4);

    setNodeOrderListEntryBelow(list, childA, childC);

    expect(list.entryCount).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(4);
  });
});

describe('setNodeOrderListFromNodeChildren', () => {
  it('enters every child at its own index', () => {
    attachAll();
    const list = createNodeOrderList();

    setNodeOrderListFromNodeChildren(list, container);

    expect(list.entryCount).toBe(3);
    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(0);
    expect(getNodeOrderListEntrySortKey(list, childB)).toBe(1);
    expect(getNodeOrderListEntrySortKey(list, childC)).toBe(2);
  });

  it('round-trips through apply without moving anything', () => {
    attachAll();
    const list = createNodeOrderList();
    setNodeOrderListFromNodeChildren(list, container);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, list);

    expectChildren(container, [childA, childB, childC]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('discards any previous contents', () => {
    const stranger = createNode(NodeKind);
    addNodeChild(container, childA);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, stranger, 99);

    setNodeOrderListFromNodeChildren(list, container);

    expect(list.entryCount).toBe(1);
    expect(hasNodeOrderListEntry(list, stranger)).toBe(false);
  });

  it('empties the list for a node with no children', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    setNodeOrderListFromNodeChildren(list, childB);

    expect(list.entryCount).toBe(0);
  });
});
describe('swapNodeOrderListEntries', () => {
  it('exchanges the sort keys of two entered nodes', () => {
    attachAll();
    const list = createNodeOrderList();
    setNodeOrderListFromNodeChildren(list, container);

    swapNodeOrderListEntries(list, childA, childC);
    applyNodeOrderList(container, list);

    expectChildren(container, [childC, childB, childA]);
  });

  it('does nothing unless both nodes are entered', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    swapNodeOrderListEntries(list, childA, childB);

    expect(getNodeOrderListEntrySortKey(list, childA)).toBe(1);
  });

  it('does nothing when the first node has no entry', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childB, 2);

    swapNodeOrderListEntries(list, childA, childB);

    expect(getNodeOrderListEntrySortKey(list, childB)).toBe(2);
  });
});
