// Generated from crates/flight-selection/src/pointer_selection_policy.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { NodeRef } from '@flighthq/node/contract';

import {
  addNodeToSelectionCore,
  clearSelectionCore,
  isNodeSelectedCore,
  selectNodeCore,
  toggleNodeSelectionCore,
} from './selectionState.ts';
import type { SelectionModifierStateRaw, SelectionStateRaw } from './types.ts';

export function applyPointerSelectionPolicyCore(
  state: Readonly<SelectionStateRaw>,
  hit: Readonly<NodeRef> | null,
  modifiers: Readonly<SelectionModifierStateRaw>,
): void {
  if (modifiers.altKey) {
    return;
  }
  if (hit === null) {
    if (!hasToggleModifier(modifiers)) {
      clearSelectionCore(state);
    }
    return;
  }
  if (hasToggleModifier(modifiers)) {
    if (modifiers.shiftKey && !isNodeSelectedCore(state, hit)) {
      addNodeToSelectionCore(state, hit);
    } else {
      toggleNodeSelectionCore(state, hit);
    }
    return;
  }
  if (!isNodeSelectedCore(state, hit)) {
    selectNodeCore(state, hit);
  }
}

export function applyPointerUpSelectionPolicyCore(
  state: Readonly<SelectionStateRaw>,
  hit: Readonly<NodeRef> | null,
  modifiers: Readonly<SelectionModifierStateRaw>,
  didDrag: boolean,
): void {
  if (hit === null) {
    return;
  }
  if (didDrag || hasAnyModifier(modifiers) || !isNodeSelectedCore(state, hit)) {
    return;
  }
  selectNodeCore(state, hit);
}

function hasAnyModifier(modifiers: Readonly<SelectionModifierStateRaw>): boolean {
  return modifiers.altKey || hasToggleModifier(modifiers);
}

function hasToggleModifier(modifiers: Readonly<SelectionModifierStateRaw>): boolean {
  return modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey;
}
