import { addNodeChild, createNode } from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { HierarchyNodeAny, Node3D, SelectionState } from '@flighthq/types/contract';

import {
  addNodeToSelection,
  clearSelection,
  createSelectionState,
  getActiveNode,
  getSelectedNodes,
  getSelectionCount,
  getSelectionSignals,
  hasSelection,
  isNodeSelected,
  removeNodeFromSelection,
  selectAllNodes,
  selectNode,
  toggleNodeSelection,
} from './index';

describe('addNodeToSelection', () => {
  it('adds in order, makes the new node active, and ignores duplicates', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();

    addNodeToSelection(selection, first);
    addNodeToSelection(selection, second);
    addNodeToSelection(selection, first);

    expect(getSelectedNodes(selection)).toEqual([first, second]);
    expect(getActiveNode(selection)).toBe(second);
  });
});

describe('clearSelection', () => {
  it('empties the selected set and clears the active node', () => {
    const selection = createSelectionState();
    selectNode(selection, createTestNode('node'));

    clearSelection(selection);

    expect(getSelectedNodes(selection)).toEqual([]);
    expect(getActiveNode(selection)).toBeNull();
  });
});

describe('createSelectionState', () => {
  it('creates empty state that accepts any hierarchy graph family', () => {
    const selection = createSelectionState();

    expect(getSelectedNodes(selection)).toEqual([]);
    expectTypeOf(createSelectionState<Node3D>()).toMatchTypeOf<SelectionState<Node3D>>();
  });
});

describe('getActiveNode', () => {
  it('returns the most recently selected remaining node', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);

    removeNodeFromSelection(selection, second);

    expect(getActiveNode(selection)).toBe(first);
  });
});

describe('getSelectedNodes', () => {
  it('returns the ordered selected identities', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [second, first]);

    expect(getSelectedNodes(selection)).toEqual([second, first]);
  });
});

describe('getSelectionCount', () => {
  it('returns the selected identity count', () => {
    const selection = createSelectionState();
    selectAllNodes(selection, [createTestNode('first'), createTestNode('second')]);

    expect(getSelectionCount(selection)).toBe(2);
  });
});

describe('getSelectionSignals', () => {
  it('emits snapshots after finalizing state and suppresses no-op emissions', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    const changes: (readonly HierarchyNodeAny[])[] = [];
    const onChange = vi.fn((selected: readonly HierarchyNodeAny[]) => {
      changes.push(selected);
      expect(getSelectedNodes(selection)).toEqual(selected);
    });
    const onActiveChange = vi.fn();
    const signals = getSelectionSignals(selection);
    connectSignal(signals.onChange, onChange);
    connectSignal(signals.onActiveChange, onActiveChange);

    addNodeToSelection(selection, first);
    addNodeToSelection(selection, first);
    addNodeToSelection(selection, second);
    removeNodeFromSelection(selection, first);
    clearSelection(selection);
    clearSelection(selection);

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onActiveChange).toHaveBeenCalledTimes(3);
    expect(changes).toEqual([[first], [first, second], [second], []]);
    expect(changes[1]).not.toBe(getSelectedNodes(selection));
  });
});

describe('hasSelection', () => {
  it('reports whether any identity is selected', () => {
    const selection = createSelectionState();
    expect(hasSelection(selection)).toBe(false);

    selectNode(selection, createTestNode('node'));
    expect(hasSelection(selection)).toBe(true);
  });
});

describe('isNodeSelected', () => {
  it('checks selection by node identity', () => {
    const selected = createTestNode('selected');
    const unselected = createTestNode('unselected');
    const selection = createSelectionState();
    selectNode(selection, selected);

    expect(isNodeSelected(selection, selected)).toBe(true);
    expect(isNodeSelected(selection, unselected)).toBe(false);
  });
});

describe('removeNodeFromSelection', () => {
  it('preserves an unrelated active node and ignores absent identities', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const absent = createTestNode('absent');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);

    removeNodeFromSelection(selection, first);
    removeNodeFromSelection(selection, absent);

    expect(getSelectedNodes(selection)).toEqual([second]);
    expect(getActiveNode(selection)).toBe(second);
  });
});

describe('selectAllNodes', () => {
  it('de-duplicates candidates in caller order and makes the last unique node active', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();

    selectAllNodes(selection, [second, first, second]);

    expect(getSelectedNodes(selection)).toEqual([second, first]);
    expect(getActiveNode(selection)).toBe(first);
  });
});

describe('selectNode', () => {
  it('replaces selection without recursively selecting descendants', () => {
    const group = createTestNode('group');
    const child = createTestNode('child');
    addNodeChild(group, child);
    const selection = createSelectionState();
    selectNode(selection, child);

    selectNode(selection, group);

    expect(getSelectedNodes(selection)).toEqual([group]);
    expect(isNodeSelected(selection, child)).toBe(false);
  });
});

describe('toggleNodeSelection', () => {
  it('adds an absent identity and removes a selected identity', () => {
    const node = createTestNode('node');
    const selection = createSelectionState();

    toggleNodeSelection(selection, node);
    expect(isNodeSelected(selection, node)).toBe(true);
    toggleNodeSelection(selection, node);
    expect(isNodeSelected(selection, node)).toBe(false);
  });
});

function createTestNode(name: string): HierarchyNodeAny {
  return createNode('SelectionTestNode', { name });
}
