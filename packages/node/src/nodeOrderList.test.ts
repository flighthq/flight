import { connectSignal } from '@flighthq/signals/contract';
import type { Node, NodeTraits } from '@flighthq/types/contract';
import { NodeKind } from '@flighthq/types/contract';

import { addNodeChild, removeNodeChild } from './hierarchy';
import { createNode, enableNodeSignals, getNodeRuntime } from './node';
import { addNodeOrderListEntry, applyNodeOrderList, clearNodeOrderList, createNodeOrderList } from './nodeOrderList';
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

describe('addNodeOrderListEntry', () => {
  it('appends entries into the valid window', () => {
    const list = createNodeOrderList();

    addNodeOrderListEntry(list, childA, 5);
    addNodeOrderListEntry(list, childB, 2);

    expect(list.count).toBe(2);
    expect(list.nodes[0]).toBe(childA);
    expect(list.keys[0]).toBe(5);
    expect(list.nodes[1]).toBe(childB);
    expect(list.keys[1]).toBe(2);
  });

  it('reuses capacity after a clear rather than growing the arrays', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);
    addNodeOrderListEntry(list, childB, 2);
    clearNodeOrderList(list);

    addNodeOrderListEntry(list, childC, 3);

    expect(list.count).toBe(1);
    expect(list.nodes.length).toBe(2);
    expect(list.nodes[0]).toBe(childC);
    expect(list.keys[0]).toBe(3);
  });
});

describe('applyNodeOrderList', () => {
  it('permutes members into ascending key order', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(container, childC);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);

    applyNodeOrderList(container, list);

    expect(getChildren(container)).toEqual([childC, childB, childA]);
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
    expect(getChildren(container)).toEqual([childB, foreign, childA]);
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

    expect(getChildren(container)).toEqual([childB, childA]);
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

    expect(getChildren(container)).toEqual([childB, childA]);
    expect(getChildren(other)).toEqual([childC]);
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

    expect(getChildren(container)).toEqual([foreign]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('sorts the survivors when only some members were removed', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(container, childC);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);
    removeNodeChild(container, childB);

    applyNodeOrderList(container, list);

    expect(getChildren(container)).toEqual([childC, childA]);
  });

  it('breaks equal keys by the order the entries were added', () => {
    addNodeChild(container, childC);
    addNodeChild(container, childB);
    addNodeChild(container, childA);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 7);
    addNodeOrderListEntry(list, childB, 7);
    addNodeOrderListEntry(list, childC, 7);

    applyNodeOrderList(container, list);

    expect(getChildren(container)).toEqual([childA, childB, childC]);
  });

  it('resolves a node entered twice to its last key', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 10);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childA, 30);

    applyNodeOrderList(container, list);

    expect(getChildren(container)).toEqual([childB, childA]);
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

    expect(getChildren(container)).toEqual([childB, childA]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });

  it('advances the children revision once for the whole permutation', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(container, childC);
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 30);
    addNodeOrderListEntry(list, childB, 20);
    addNodeOrderListEntry(list, childC, 10);
    const revision = getNodeChildrenRevision(container);

    applyNodeOrderList(container, list);

    expect(getNodeChildrenRevision(container)).toBe((revision + 1) >>> 0);
  });

  it('calls onChildrenOrderChanged on the parent once', () => {
    addNodeChild(container, childA);
    addNodeChild(container, childB);
    addNodeChild(container, childC);
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

    expect(getChildren(container)).toEqual([childA, childB]);
    expect(getNodeChildrenRevision(container)).toBe(revision);
  });
});

describe('clearNodeOrderList', () => {
  it('empties the valid window', () => {
    const list = createNodeOrderList();
    addNodeOrderListEntry(list, childA, 1);

    clearNodeOrderList(list);

    expect(list.count).toBe(0);
  });
});

describe('createNodeOrderList', () => {
  it('creates an empty list', () => {
    const list = createNodeOrderList();

    expect(list.count).toBe(0);
    expect(list.keys).toEqual([]);
    expect(list.nodes).toEqual([]);
  });
});
