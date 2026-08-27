import type { HierarchyNodeAny, SelectionModifierState, SelectionState } from '@flighthq/types/contract';

import { addNodeToSelection, clearSelection, isNodeSelected, selectNode, toggleNodeSelection } from './selectionState';

export function applyPointerSelectionPolicy<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  hit: NodeType | null,
  modifiers: Readonly<SelectionModifierState>,
): void {
  // Alt is carried so callers can layer an alternate-pick policy on top. The base selection policy
  // does not give it an implicit mutation that the caller cannot distinguish from an ordinary click.
  if (modifiers.altKey) return;

  if (hit === null) {
    if (!hasToggleModifier(modifiers)) clearSelection(state);
    return;
  }

  if (hasToggleModifier(modifiers)) {
    if (modifiers.shiftKey && !isNodeSelected(state, hit)) {
      addNodeToSelection(state, hit);
    } else {
      toggleNodeSelection(state, hit);
    }
    return;
  }

  if (!isNodeSelected(state, hit)) selectNode(state, hit);
}

export function applyPointerUpSelectionPolicy<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  hit: NodeType | null,
  modifiers: Readonly<SelectionModifierState>,
  didDrag: boolean,
): void {
  if (didDrag || hit === null || hasAnyModifier(modifiers) || !isNodeSelected(state, hit)) return;
  selectNode(state, hit);
}

function hasAnyModifier(modifiers: Readonly<SelectionModifierState>): boolean {
  return modifiers.altKey || hasToggleModifier(modifiers);
}

function hasToggleModifier(modifiers: Readonly<SelectionModifierState>): boolean {
  return modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey;
}
