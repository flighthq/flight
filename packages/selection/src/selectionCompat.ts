import type { EntityConstruction } from '@flighthq/entity/contract';
import type { Rectangle } from '@flighthq/geometry/contract';
import type { NodeRef, getNodeLocalBoundsRectangle } from '@flighthq/node/contract';
import type { Path } from '@flighthq/path/contract';

import {
  addLassoSelectionPointCore,
  beginLassoSelectionCore,
  createLassoSelectionCore,
  endLassoSelectionCore,
  findNodesInLassoSelectionInto,
  getLassoSelectionPathCore,
  initializeLassoSelectionCore,
} from './lassoSelection.ts';
import {
  beginMarqueeSelectionCore,
  createMarqueeSelectionCore,
  endMarqueeSelectionCore,
  findNodesInMarqueeSelectionInto,
  getMarqueeRectangleCore,
  updateMarqueeSelectionCore,
} from './marqueeSelection.ts';
import { applyPointerSelectionPolicyCore, applyPointerUpSelectionPolicyCore } from './pointerSelectionPolicy.ts';
import type {
  LassoSelection,
  MarqueeSelection,
  MarqueeSelectionMode,
  SelectionModifierState,
  SelectionSignals,
  SelectionState,
} from './selectionCompatTypes.ts';
import {
  addNodeToSelectionCore,
  clearSelectionCore,
  createSelectionStateCore,
  getActiveNodeCore,
  getSelectedNodesCore,
  getSelectionCountCore,
  getSelectionSignalsCore,
  hasSelectionCore,
  isNodeSelectedCore,
  removeNodeFromSelectionCore,
  selectAllNodesCore,
  selectNodeCore,
  toggleNodeSelectionCore,
} from './selectionState.ts';
import type {
  LassoSelectionRaw,
  MarqueeSelectionModeRaw,
  MarqueeSelectionRaw,
  SelectionModifierStateRaw,
  SelectionStateRaw,
} from './types.ts';

export type {
  LassoSelection,
  MarqueeSelection,
  MarqueeSelectionMode,
  SelectionModifierState,
  SelectionSignals,
  SelectionState,
} from './selectionCompatTypes.ts';

type BoundsNodeAny = Parameters<typeof getNodeLocalBoundsRectangle>[0];

export function addLassoSelectionPoint(selection: LassoSelection, x: number, y: number): void {
  addLassoSelectionPointCore(selection as LassoSelectionRaw, x, y);
}

export function addNodeToSelection<NodeType extends NodeRef>(state: SelectionState<NodeType>, node: NodeType): void {
  addNodeToSelectionCore(state as SelectionStateRaw, node as NodeRef);
}

export function applyPointerSelectionPolicy<NodeType extends NodeRef>(
  state: SelectionState<NodeType>,
  hit: NodeType | null,
  modifiers: Readonly<SelectionModifierState>,
): void {
  applyPointerSelectionPolicyCore(
    state as SelectionStateRaw,
    hit as NodeRef | null,
    modifiers as SelectionModifierStateRaw,
  );
}

export function applyPointerUpSelectionPolicy<NodeType extends NodeRef>(
  state: SelectionState<NodeType>,
  hit: NodeType | null,
  modifiers: Readonly<SelectionModifierState>,
  didDrag: boolean,
): void {
  applyPointerUpSelectionPolicyCore(
    state as SelectionStateRaw,
    hit as NodeRef | null,
    modifiers as SelectionModifierStateRaw,
    didDrag,
  );
}

export function beginLassoSelection(selection: LassoSelection, startX: number, startY: number): void {
  beginLassoSelectionCore(selection as LassoSelectionRaw, startX, startY);
}

export function beginMarqueeSelection(selection: MarqueeSelection, startX: number, startY: number): void {
  beginMarqueeSelectionCore(selection as MarqueeSelectionRaw, startX, startY);
}

export function clearSelection<NodeType extends NodeRef>(state: SelectionState<NodeType>): void {
  clearSelectionCore(state as SelectionStateRaw);
}

export function createLassoSelection(): LassoSelection {
  return createLassoSelectionCore();
}

export function createMarqueeSelection(): MarqueeSelection {
  return createMarqueeSelectionCore();
}

export function createSelectionState<NodeType extends NodeRef = NodeRef>(): SelectionState<NodeType> {
  return createSelectionStateCore() as SelectionState<NodeType>;
}

export function endLassoSelection(selection: LassoSelection): Path {
  return endLassoSelectionCore(selection as LassoSelectionRaw) as Path;
}

export function endMarqueeSelection(selection: MarqueeSelection): Rectangle {
  return endMarqueeSelectionCore(selection as MarqueeSelectionRaw) as Rectangle;
}

export function findNodesInLassoSelection<NodeType extends BoundsNodeAny>(
  selection: Readonly<LassoSelection>,
  candidates: readonly NodeType[],
): NodeType[] {
  const matches: NodeRef[] = [];
  findNodesInLassoSelectionInto(matches, selection as Readonly<LassoSelectionRaw>, candidates as readonly NodeRef[]);
  return matches as NodeType[];
}

export function findNodesInMarqueeSelection<NodeType extends BoundsNodeAny>(
  selection: Readonly<MarqueeSelection>,
  candidates: readonly NodeType[],
  mode: MarqueeSelectionMode = 'intersect',
): NodeType[] {
  const matches: NodeRef[] = [];
  findNodesInMarqueeSelectionInto(
    matches,
    selection as Readonly<MarqueeSelectionRaw>,
    candidates as readonly NodeRef[],
    mode as MarqueeSelectionModeRaw,
  );
  return matches as NodeType[];
}

export function getActiveNode<NodeType extends NodeRef>(state: SelectionState<NodeType>): NodeType | null {
  return getActiveNodeCore(state as SelectionStateRaw) as NodeType | null;
}

export function getLassoSelectionPath(selection: Readonly<LassoSelection>): Readonly<Path> {
  return getLassoSelectionPathCore(selection as Readonly<LassoSelectionRaw>);
}

export function getMarqueeRectangle(selection: Readonly<MarqueeSelection>): Readonly<Rectangle> {
  return getMarqueeRectangleCore(selection as Readonly<MarqueeSelectionRaw>);
}

export function getSelectedNodes<NodeType extends NodeRef>(state: SelectionState<NodeType>): readonly NodeType[] {
  const selected: NodeRef[] = [];
  getSelectedNodesCore(selected, state as SelectionStateRaw);
  return selected as unknown as readonly NodeType[];
}

export function getSelectionCount<NodeType extends NodeRef>(state: SelectionState<NodeType>): number {
  return getSelectionCountCore(state as SelectionStateRaw);
}

export function getSelectionSignals<NodeType extends NodeRef>(
  state: SelectionState<NodeType>,
): Readonly<SelectionSignals<NodeType>> {
  return getSelectionSignalsCore(state as SelectionStateRaw) as unknown as Readonly<SelectionSignals<NodeType>>;
}

export function hasSelection<NodeType extends NodeRef>(state: SelectionState<NodeType>): boolean {
  return hasSelectionCore(state as SelectionStateRaw);
}

export function initializeLassoSelection(out: EntityConstruction<LassoSelection>): void {
  initializeLassoSelectionCore(out as LassoSelectionRaw);
}

export function isNodeSelected<NodeType extends NodeRef>(state: SelectionState<NodeType>, node: NodeType): boolean {
  return isNodeSelectedCore(state as SelectionStateRaw, node as NodeRef);
}

export function removeNodeFromSelection<NodeType extends NodeRef>(
  state: SelectionState<NodeType>,
  node: NodeType,
): void {
  removeNodeFromSelectionCore(state as SelectionStateRaw, node as NodeRef);
}

export function selectAllNodes<NodeType extends NodeRef>(
  state: SelectionState<NodeType>,
  candidates: readonly NodeType[],
): void {
  selectAllNodesCore(state as SelectionStateRaw, candidates as readonly NodeRef[]);
}

export function selectNode<NodeType extends NodeRef>(state: SelectionState<NodeType>, node: NodeType): void {
  selectNodeCore(state as SelectionStateRaw, node as NodeRef);
}

export function toggleNodeSelection<NodeType extends NodeRef>(state: SelectionState<NodeType>, node: NodeType): void {
  toggleNodeSelectionCore(state as SelectionStateRaw, node as NodeRef);
}

export function updateMarqueeSelection(selection: MarqueeSelection, currentX: number, currentY: number): void {
  updateMarqueeSelectionCore(selection as MarqueeSelectionRaw, currentX, currentY);
}
