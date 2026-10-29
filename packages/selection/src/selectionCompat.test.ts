// Generated from crates/flight-selection/tests/selection_compat_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import * as flightGeometry from '@flighthq/geometry/contract';
import * as flightNode from '@flighthq/node/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  addLassoSelectionPoint,
  addNodeToSelection,
  applyPointerSelectionPolicy,
  applyPointerUpSelectionPolicy,
  beginLassoSelection,
  beginMarqueeSelection,
  clearSelection,
  createLassoSelection,
  createMarqueeSelection,
  createSelectionState,
  endLassoSelection,
  endMarqueeSelection,
  getActiveNode,
  getLassoSelectionPath,
  getMarqueeRectangle,
  getSelectionCount,
  getSelectionSignals,
  hasSelection,
  initializeLassoSelection,
  isNodeSelected,
  removeNodeFromSelection,
  selectAllNodes,
  selectNode,
  toggleNodeSelection,
  updateMarqueeSelection,
} from './contract.ts';
import type { SelectionModifierState } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

function modifiers(altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean): SelectionModifierState {
  return { altKey: altKey, ctrlKey: ctrlKey, metaKey: metaKey, shiftKey: shiftKey };
}

describe('addLassoSelectionPoint', () => {
  it('appends line points only during an active gesture', () => {
    let lasso = createLassoSelection();
    addLassoSelectionPoint(lasso, 99.0, 99.0);
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    endLassoSelection(lasso);
    addLassoSelectionPoint(lasso, 5.0, 6.0);
    expect(getLassoSelectionPath(lasso).data).toEqual([1.0, 2.0, 3.0, 4.0]);
  });
});

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

describe('applyPointerSelectionPolicy', () => {
  it('adds or removes with shift and toggles with ctrl or command', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    applyPointerSelectionPolicy(selection, first, modifiers(false, false, false, true));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first])).toBe(true);
    applyPointerSelectionPolicy(selection, first, modifiers(false, false, false, true));
    expect(crate.selectedNodesOf(selection).length === 0).toBe(true);
    applyPointerSelectionPolicy(selection, first, modifiers(false, true, false, false));
    applyPointerSelectionPolicy(selection, second, modifiers(false, false, true, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    applyPointerSelectionPolicy(selection, first, modifiers(false, false, true, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second])).toBe(true);
    applyPointerSelectionPolicy(selection, null, modifiers(false, true, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second])).toBe(true);
  });
  it('applies unmodified hit and empty space behavior', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);
    applyPointerSelectionPolicy(selection, first, modifiers(false, false, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    const third = crate.createTestNode('third');
    applyPointerSelectionPolicy(selection, third, modifiers(false, false, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [third])).toBe(true);
    applyPointerSelectionPolicy(selection, null, modifiers(false, false, false, false));
    expect(crate.selectedNodesOf(selection).length === 0).toBe(true);
  });
  it('leaves alt gestures available for caller defined alternate pick behavior', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first]);
    applyPointerSelectionPolicy(selection, second, modifiers(true, false, false, false));
    applyPointerSelectionPolicy(selection, null, modifiers(true, false, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first])).toBe(true);
  });
});

describe('applyPointerUpSelectionPolicy', () => {
  it('narrows an already selected hit only on unmodified pointer up without a drag', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);
    applyPointerUpSelectionPolicy(selection, first, modifiers(false, false, false, false), true);
    applyPointerUpSelectionPolicy(selection, first, modifiers(false, false, false, true), false);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    applyPointerUpSelectionPolicy(selection, first, modifiers(false, false, false, false), false);
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first])).toBe(true);
  });
});

describe('beginLassoSelection', () => {
  it('resets the reused path and starts it with a move command', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    endLassoSelection(lasso);
    beginLassoSelection(lasso, 10.0, 11.0);
    expect(crate.hasOnlyMoveCommand(getLassoSelectionPath(lasso))).toBe(true);
    expect(getLassoSelectionPath(lasso).data).toEqual([10.0, 11.0]);
  });
});

describe('beginMarqueeSelection', () => {
  it('starts a new zero area rectangle at the pointer location', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10.0, 20.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(10.0, 20.0, 0.0, 0.0));
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

describe('createLassoSelection', () => {
  it('creates an empty even odd path', () => {
    const lasso = createLassoSelection();
    const path = getLassoSelectionPath(lasso);
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(crate.hasEvenOddWinding(path)).toBe(true);
  });
});

describe('createMarqueeSelection', () => {
  it('creates an inactive marquee with an empty rectangle', () => {
    let marquee = createMarqueeSelection();
    updateMarqueeSelection(marquee, 100.0, 100.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(0.0, 0.0, 0.0, 0.0));
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

describe('endLassoSelection', () => {
  it('closes an active path once and returns the live path object', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    const returned = endLassoSelection(lasso);
    endLassoSelection(lasso);
    expect(crate.samePath(returned, getLassoSelectionPath(lasso))).toBe(true);
    expect(crate.hasMoveLineCloseCommands(getLassoSelectionPath(lasso))).toBe(true);
  });
});

describe('endMarqueeSelection', () => {
  it('returns the live rectangle and makes later updates inert', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 1.0, 2.0);
    updateMarqueeSelection(marquee, 3.0, 4.0);
    const returned = endMarqueeSelection(marquee);
    updateMarqueeSelection(marquee, 50.0, 50.0);
    expect(crate.sameRectangle(returned, getMarqueeRectangle(marquee))).toBe(true);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(1.0, 2.0, 2.0, 2.0));
  });
});

describe('findNodesInLassoSelection', () => {
  // Rust-only: clears a reused out and keeps its capacity
  it('includes degenerate boundary edges without changing even odd fill', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const boundary = crate.createBoundedNode('boundary', createRectangle(10.0, 0.0, 0.0, 0.0), true, true);
    expect(crate.sameNodes(crate.lassoMatches(lasso, [boundary]), [boundary])).toBe(true);
  });
  it('selects bounds centers inside or on the lasso boundary in caller order', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const inside = crate.createBoundedNode('inside', createRectangle(4.0, 4.0, 2.0, 2.0), true, true);
    const boundary = crate.createBoundedNode('boundary', createRectangle(9.0, 4.0, 2.0, 2.0), true, true);
    const outside = crate.createBoundedNode('outside', createRectangle(11.0, 11.0, 2.0, 2.0), true, true);
    expect(crate.sameNodes(crate.lassoMatches(lasso, [outside, boundary, inside]), [boundary, inside])).toBe(true);
  });
  it('tests the bounds center rather than rectangle overlap', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const overlapsWithCenterOutside = crate.createBoundedNode(
      'overlap',
      createRectangle(9.0, 9.0, 10.0, 10.0),
      true,
      true,
    );
    expect(crate.lassoMatches(lasso, [overlapsWithCenterOutside]).length === 0).toBe(true);
  });
  it('returns no candidates for a path with fewer than three points', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    endLassoSelection(lasso);
    const candidate = crate.createBoundedNode('node', createRectangle(0.0, 0.0, 1.0, 1.0), true, true);
    expect(crate.lassoMatches(lasso, [candidate]).length === 0).toBe(true);
  });
});

describe('findNodesInMarqueeSelection', () => {
  // Rust-only: clears a reused out and keeps its capacity
  it('finds intersecting or fully contained bounds in caller order', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 0.0, 0.0);
    updateMarqueeSelection(marquee, 10.0, 10.0);
    const contained = crate.createBoundedNode('contained', createRectangle(2.0, 2.0, 2.0, 2.0), true, true);
    const overlapping = crate.createBoundedNode('overlapping', createRectangle(8.0, 8.0, 5.0, 5.0), true, true);
    const outside = crate.createBoundedNode('outside', createRectangle(20.0, 20.0, 1.0, 1.0), true, true);
    const candidates = [overlapping, outside, contained];
    expect(crate.sameNodes(crate.marqueeMatches(marquee, candidates, undefined), [overlapping, contained])).toBe(true);
    expect(crate.sameNodes(crate.marqueeMatches(marquee, candidates, crate.containMarqueeMode()), [contained])).toBe(
      true,
    );
  });
  it('uses local bounds without filtering disabled or hidden candidates', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 0.0, 0.0);
    updateMarqueeSelection(marquee, 10.0, 10.0);
    const disabled = crate.createBoundedNode('disabled', createRectangle(1.0, 1.0, 1.0, 1.0), false, true);
    const hidden = crate.createBoundedNode('hidden', createRectangle(2.0, 2.0, 1.0, 1.0), true, false);
    expect(crate.sameNodes(crate.marqueeMatches(marquee, [disabled, hidden], undefined), [disabled, hidden])).toBe(
      true,
    );
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

describe('getLassoSelectionPath', () => {
  it('exposes the same path throughout a gesture', () => {
    let lasso = createLassoSelection();
    const original = getLassoSelectionPath(lasso);
    beginLassoSelection(lasso, 1.0, 2.0);
    expect(crate.samePath(original, getLassoSelectionPath(lasso))).toBe(true);
  });
});

describe('getMarqueeRectangle', () => {
  it('exposes the same rectangle throughout a gesture', () => {
    let marquee = createMarqueeSelection();
    const original = getMarqueeRectangle(marquee);
    beginMarqueeSelection(marquee, 4.0, 5.0);
    expect(crate.sameRectangle(original, getMarqueeRectangle(marquee))).toBe(true);
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
    const changes: { value: string[][] } = { value: [] as never[] };
    const active: { value: string[] } = { value: [] as never[] };
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
    expect(crate.signalIsInert(signals.onChange)).toBe(true);
    expect(crate.signalIsInert(signals.onActiveChange)).toBe(true);
    selectNode(selection, crate.createTestNode('node'));
    expect(crate.signalIsInert(signals.onChange)).toBe(true);
    expect(crate.signalIsInert(signals.onActiveChange)).toBe(true);
  });
  it('preserves reentrant snapshot and active emission semantics', () => {
    const selection = createSelectionState();
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const calls: { value: string[] } = { value: [] as never[] };
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

describe('initializeLassoSelection', () => {
  it('restores an empty even odd path', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    initializeLassoSelection(lasso);
    const path = getLassoSelectionPath(lasso);
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(crate.hasEvenOddWinding(path)).toBe(true);
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

describe('updateMarqueeSelection', () => {
  it('normalizes a reverse drag into positive rectangle dimensions', () => {
    let marquee = createMarqueeSelection();
    beginMarqueeSelection(marquee, 10.0, 20.0);
    updateMarqueeSelection(marquee, 2.0, 5.0);
    expect(getMarqueeRectangle(marquee)).toEqual(createRectangle(2.0, 5.0, 8.0, 15.0));
  });
});
