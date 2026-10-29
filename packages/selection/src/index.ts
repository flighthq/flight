// Generated from crates/flight-selection/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
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
  findNodesInLassoSelection,
  findNodesInMarqueeSelection,
  getActiveNode,
  getLassoSelectionPath,
  getMarqueeRectangle,
  getSelectedNodes,
  getSelectionCount,
  getSelectionSignals,
  hasSelection,
  isNodeSelected,
  removeNodeFromSelection,
  selectAllNodes,
  selectNode,
  toggleNodeSelection,
  updateMarqueeSelection,
} from './contract.ts';

export type { SelectionSignals } from './contract.ts';

export type {
  LassoSelection,
  MarqueeSelection,
  MarqueeSelectionMode,
  SelectionModifierState,
  SelectionState,
} from './selectionCompat.ts';
