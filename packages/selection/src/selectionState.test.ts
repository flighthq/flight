// Generated from crates/flight-selection/tests/selection_state_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightGeometry from '@flighthq/geometry/contract';
import * as flightNode from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  addNodeToSelection,
  clearSelection,
  createSelectionState,
  getActiveNode,
  getSelectionCount,
  getSelectionSignals,
  hasSelection,
  isNodeSelected,
  removeNodeFromSelection,
  selectAllNodes,
  selectNode,
  toggleNodeSelection,
} from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

describe('addNodeToSelection', () => {
  it('adds in order makes the new node active and ignores duplicates', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    addNodeToSelection(selection, first);
    addNodeToSelection(selection, second);
    addNodeToSelection(selection, first);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    expect(crate.sameNode(getActiveNode(selection)!, second)).toBe(true);
  });
});

describe('clearSelection', () => {
  it('empties the selected set and clears the active node', () => {
    const selection = createSelectionState();
    selectNode(selection, crate.createTestNode('node'));
    clearSelection(selection);
    expect(crate.selectedNodesOf(selection).length === 0).toBe(true);
    expect(getActiveNode(selection) === null).toBe(true);
  });
});

describe('createSelectionState', () => {
  // Rust-only: creates an entity with one stable uid slot
  it('creates empty state that accepts any hierarchy graph family', () => {
    const selection = createSelectionState();
    const bare = crate.createTestNode('bare');
    const bounded = crate.createBoundedNode('bounded', flightGeometry.createRectangle(0.0, 0.0, 1.0, 1.0), true, true);
    selectAllNodes(selection, [bare, bounded]);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [bare, bounded])).toBe(true);
  });
});

describe('getActiveNode', () => {
  it('returns the most recently selected remaining node', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);
    removeNodeFromSelection(selection, second);
    expect(crate.sameNode(getActiveNode(selection)!, first)).toBe(true);
  });
});

describe('getSelectedNodes', () => {
  // Rust-only: clears a reused out and keeps its capacity
  it('returns the ordered selected identities', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [second, first]);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second, first])).toBe(true);
  });
});

describe('getSelectionCount', () => {
  it('returns the selected identity count', () => {
    const selection = createSelectionState();
    selectAllNodes(selection, [crate.createTestNode('first'), crate.createTestNode('second')]);
    expect(getSelectionCount(selection)).toEqual(2);
  });
});

describe('getSelectionSignals', () => {
  it('emits finalized snapshots in source order and suppresses no ops', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    const changes: Readonly<{ value: string[][] }> = { value: [] as never[] };
    const active: Readonly<{ value: string[] }> = { value: [] as never[] };
    const signals = getSelectionSignals(selection);
    const changeLog = changes;
    connectSignal(
      signals.onChange,
      (selected) => {
        changeLog.value.push(selected.map(crate.nodeName));
      },
      undefined,
    );
    const activeLog = active;
    connectSignal(
      signals.onActiveChange,
      (selected) => {
        activeLog.value.push(crate.optionalNodeName(selected));
      },
      undefined,
    );
    addNodeToSelection(selection, first);
    addNodeToSelection(selection, first);
    addNodeToSelection(selection, second);
    removeNodeFromSelection(selection, first);
    clearSelection(selection);
    clearSelection(selection);
    expect(changes.value).toEqual([['first'], ['first', 'second'], ['second'], [] as never[]]);
    expect(active.value).toEqual(['first', 'second', '']);
  });
  it('keeps signals opt in until a slot is connected', () => {
    const selection = createSelectionState();
    const signals = getSelectionSignals(selection);
    expect(signals.onChange.data! === null).toBe(true);
    expect(signals.onActiveChange.data! === null).toBe(true);
    selectNode(selection, crate.createTestNode('node'));
    expect(signals.onChange.data! === null).toBe(true);
    expect(signals.onActiveChange.data! === null).toBe(true);
  });
  it('preserves reentrant snapshot and active emission semantics', () => {
    const selection = createSelectionState();
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const calls: Readonly<{ value: string[] }> = { value: [] as never[] };
    const reentered = { value: false };
    const signals = getSelectionSignals(selection);
    const changeCalls = calls;
    const reentrantState = selection;
    const reentrantNode = second;
    const reentrantFlag = reentered;
    connectSignal(
      signals.onChange,
      (selected) => {
        changeCalls.value.push(`change:${crate.joinedNodeNames(selected)}`);
        if (crate.takeReentrantFlag(reentrantFlag)) {
          addNodeToSelection(reentrantState, reentrantNode);
        }
      },
      undefined,
    );
    const activeCalls = calls;
    connectSignal(
      signals.onActiveChange,
      (selected) => {
        activeCalls.value.push(`active:${crate.optionalNodeName(selected)}`);
      },
      undefined,
    );
    addNodeToSelection(selection, first);
    expect(calls.value).toEqual(['change:first', 'change:first,second', 'active:second', 'active:second']);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
  });
});

describe('hasSelection', () => {
  it('reports whether any identity is selected', () => {
    const selection = createSelectionState();
    expect(!hasSelection(selection)).toBe(true);
    selectNode(selection, crate.createTestNode('node'));
    expect(hasSelection(selection)).toBe(true);
  });
});

describe('isNodeSelected', () => {
  it('checks selection by node identity', () => {
    const selected = crate.createTestNode('selected');
    const unselected = crate.createTestNode('unselected');
    const selection = createSelectionState();
    selectNode(selection, selected);
    expect(isNodeSelected(selection, selected)).toBe(true);
    expect(!isNodeSelected(selection, unselected)).toBe(true);
  });
});

describe('removeNodeFromSelection', () => {
  it('preserves an unrelated active node and ignores absent identities', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const absent = crate.createTestNode('absent');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);
    removeNodeFromSelection(selection, first);
    removeNodeFromSelection(selection, absent);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second])).toBe(true);
    expect(crate.sameNode(getActiveNode(selection)!, second)).toBe(true);
  });
});

describe('selectAllNodes', () => {
  it('de duplicates candidates in caller order and makes the last unique node active', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [second, first, second]);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second, first])).toBe(true);
    expect(crate.sameNode(getActiveNode(selection)!, first)).toBe(true);
  });
  it('replaces the selection without retaining the source array', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    let candidates = [first];
    selectAllNodes(selection, candidates);
    candidates[0] = second;
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first])).toBe(true);
  });
});

describe('selectNode', () => {
  it('replaces selection without recursively selecting descendants', () => {
    const group = crate.createTestNode('group');
    const child = crate.createTestNode('child');
    flightNode.addNodeChild(group, child);
    const selection = createSelectionState();
    selectNode(selection, child);
    selectNode(selection, group);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [group])).toBe(true);
    expect(!isNodeSelected(selection, child)).toBe(true);
  });
});

describe('toggleNodeSelection', () => {
  it('adds an absent identity and removes a selected identity', () => {
    const node = crate.createTestNode('node');
    const selection = createSelectionState();
    toggleNodeSelection(selection, node);
    expect(isNodeSelected(selection, node)).toBe(true);
    toggleNodeSelection(selection, node);
    expect(!isNodeSelected(selection, node)).toBe(true);
  });
});
