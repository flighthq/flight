// Generated from crates/flight-selection/tests/pointer_selection_policy_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { applyPointerUpSelectionPolicy, createSelectionState, selectAllNodes } from './contract.ts';
import type { SelectionModifierState } from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

function modifiers(altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean): SelectionModifierState {
  return { altKey: altKey, ctrlKey: ctrlKey, metaKey: metaKey, shiftKey: shiftKey };
}

describe('applyPointerSelectionPolicy', () => {
  it('adds or removes with shift and toggles with ctrl or command', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    crate.applyPointerPolicy(selection, first, modifiers(false, false, false, true));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first])).toBe(true);
    crate.applyPointerPolicy(selection, first, modifiers(false, false, false, true));
    expect(crate.selectedNodesOf(selection).length === 0).toBe(true);
    crate.applyPointerPolicy(selection, first, modifiers(false, true, false, false));
    crate.applyPointerPolicy(selection, second, modifiers(false, false, true, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    crate.applyPointerPolicy(selection, first, modifiers(false, false, true, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second])).toBe(true);
    crate.applyPointerPolicy(selection, undefined, modifiers(false, true, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [second])).toBe(true);
  });
  it('applies unmodified hit and empty space behavior', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);
    crate.applyPointerPolicy(selection, first, modifiers(false, false, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [first, second])).toBe(true);
    const third = crate.createTestNode('third');
    crate.applyPointerPolicy(selection, third, modifiers(false, false, false, false));
    expect(crate.sameNodes(crate.selectedNodesOf(selection), [third])).toBe(true);
    crate.applyPointerPolicy(selection, undefined, modifiers(false, false, false, false));
    expect(crate.selectedNodesOf(selection).length === 0).toBe(true);
  });
  it('leaves alt gestures available for caller defined alternate pick behavior', () => {
    const first = crate.createTestNode('first');
    const second = crate.createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first]);
    crate.applyPointerPolicy(selection, second, modifiers(true, false, false, false));
    crate.applyPointerPolicy(selection, undefined, modifiers(true, false, false, false));
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
