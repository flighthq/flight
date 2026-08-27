import { createNode } from '@flighthq/node/contract';
import type { HierarchyNodeAny, SelectionModifierState } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  applyPointerSelectionPolicy,
  applyPointerUpSelectionPolicy,
  createSelectionState,
  getSelectedNodes,
  selectAllNodes,
} from './index';

describe('applyPointerSelectionPolicy', () => {
  it('applies unmodified hit and empty-space behavior', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);

    applyPointerSelectionPolicy(selection, first, modifiers());
    expect(getSelectedNodes(selection)).toEqual([first, second]);

    const third = createTestNode('third');
    applyPointerSelectionPolicy(selection, third, modifiers());
    expect(getSelectedNodes(selection)).toEqual([third]);

    applyPointerSelectionPolicy(selection, null, modifiers());
    expect(getSelectedNodes(selection)).toEqual([]);
  });

  it('adds or removes with Shift and toggles with Ctrl or Command', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();

    applyPointerSelectionPolicy(selection, first, modifiers({ shiftKey: true }));
    expect(getSelectedNodes(selection)).toEqual([first]);
    applyPointerSelectionPolicy(selection, first, modifiers({ shiftKey: true }));
    expect(getSelectedNodes(selection)).toEqual([]);

    applyPointerSelectionPolicy(selection, first, modifiers({ ctrlKey: true }));
    applyPointerSelectionPolicy(selection, second, modifiers({ metaKey: true }));
    expect(getSelectedNodes(selection)).toEqual([first, second]);
    applyPointerSelectionPolicy(selection, first, modifiers({ metaKey: true }));
    expect(getSelectedNodes(selection)).toEqual([second]);

    applyPointerSelectionPolicy(selection, null, modifiers({ ctrlKey: true }));
    expect(getSelectedNodes(selection)).toEqual([second]);
  });

  it('leaves Alt gestures available for caller-defined alternate-pick behavior', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first]);

    applyPointerSelectionPolicy(selection, second, modifiers({ altKey: true }));
    applyPointerSelectionPolicy(selection, null, modifiers({ altKey: true }));

    expect(getSelectedNodes(selection)).toEqual([first]);
  });
});

describe('applyPointerUpSelectionPolicy', () => {
  it('narrows an already-selected hit only on an unmodified pointer-up without a drag', () => {
    const first = createTestNode('first');
    const second = createTestNode('second');
    const selection = createSelectionState();
    selectAllNodes(selection, [first, second]);

    applyPointerUpSelectionPolicy(selection, first, modifiers(), true);
    applyPointerUpSelectionPolicy(selection, first, modifiers({ shiftKey: true }), false);
    expect(getSelectedNodes(selection)).toEqual([first, second]);

    applyPointerUpSelectionPolicy(selection, first, modifiers(), false);
    expect(getSelectedNodes(selection)).toEqual([first]);
  });
});

function createTestNode(name: string): HierarchyNodeAny {
  return createNode('SelectionTestNode', { name });
}

function modifiers(overrides?: Partial<SelectionModifierState>): SelectionModifierState {
  return { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}
