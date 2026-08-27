import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  HierarchyNodeAny,
  SelectionSignals,
  SelectionState,
  SelectionStateRuntime,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function addNodeToSelection<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  node: NodeType,
): void {
  const runtime = getSelectionStateRuntime(state);
  if (runtime.selectedNodeSet.has(node)) return;

  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodes.push(node);
  runtime.selectedNodeSet.add(node);
  runtime.activeNode = node;
  emitSelectionChanges(runtime, true, previousActiveNode);
}

export function clearSelection<NodeType extends HierarchyNodeAny>(state: SelectionState<NodeType>): void {
  const runtime = getSelectionStateRuntime(state);
  if (runtime.selectedNodes.length === 0) return;

  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodes = [];
  runtime.selectedNodeSet = new Set();
  runtime.activeNode = null;
  emitSelectionChanges(runtime, true, previousActiveNode);
}

export function createSelectionState<NodeType extends HierarchyNodeAny = HierarchyNodeAny>(): SelectionState<NodeType> {
  const state = { [EntityRuntimeKey]: undefined } as SelectionState<NodeType>;
  const runtime = {
    activeNode: null,
    binding: null,
    selectedNodeSet: new Set<NodeType>(),
    selectedNodes: [],
    signals: {
      onActiveChange: createSignal(),
      onChange: createSignal(),
    },
  } satisfies SelectionStateRuntime<NodeType>;
  state[EntityRuntimeKey] = runtime;
  return state;
}

export function getActiveNode<NodeType extends HierarchyNodeAny>(state: SelectionState<NodeType>): NodeType | null {
  return getSelectionStateRuntime(state).activeNode;
}

export function getSelectedNodes<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
): readonly NodeType[] {
  return getSelectionStateRuntime(state).selectedNodes;
}

export function getSelectionCount<NodeType extends HierarchyNodeAny>(state: SelectionState<NodeType>): number {
  return getSelectionStateRuntime(state).selectedNodes.length;
}

export function getSelectionSignals<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
): Readonly<SelectionSignals<NodeType>> {
  return getSelectionStateRuntime(state).signals;
}

export function hasSelection<NodeType extends HierarchyNodeAny>(state: SelectionState<NodeType>): boolean {
  return getSelectionStateRuntime(state).selectedNodes.length !== 0;
}

export function isNodeSelected<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  node: NodeType,
): boolean {
  return getSelectionStateRuntime(state).selectedNodeSet.has(node);
}

export function removeNodeFromSelection<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  node: NodeType,
): void {
  const runtime = getSelectionStateRuntime(state);
  if (!runtime.selectedNodeSet.has(node)) return;

  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodeSet.delete(node);
  runtime.selectedNodes.splice(runtime.selectedNodes.indexOf(node), 1);
  if (runtime.activeNode === node) {
    runtime.activeNode = runtime.selectedNodes[runtime.selectedNodes.length - 1] ?? null;
  }
  emitSelectionChanges(runtime, true, previousActiveNode);
}

export function selectAllNodes<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  candidates: readonly NodeType[],
): void {
  const runtime = getSelectionStateRuntime(state);
  const selectedNodeSet = new Set<NodeType>();
  const selectedNodes: NodeType[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (selectedNodeSet.has(candidate)) continue;
    selectedNodeSet.add(candidate);
    selectedNodes.push(candidate);
  }

  let selectionChanged = runtime.selectedNodes.length !== selectedNodes.length;
  if (!selectionChanged) {
    for (let i = 0; i < selectedNodes.length; i++) {
      if (runtime.selectedNodes[i] !== selectedNodes[i]) {
        selectionChanged = true;
        break;
      }
    }
  }
  if (!selectionChanged) return;

  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodeSet = selectedNodeSet;
  runtime.selectedNodes = selectedNodes;
  runtime.activeNode = selectedNodes[selectedNodes.length - 1] ?? null;
  emitSelectionChanges(runtime, true, previousActiveNode);
}

export function selectNode<NodeType extends HierarchyNodeAny>(state: SelectionState<NodeType>, node: NodeType): void {
  const runtime = getSelectionStateRuntime(state);
  if (runtime.selectedNodes.length === 1 && runtime.selectedNodes[0] === node) return;

  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodeSet = new Set([node]);
  runtime.selectedNodes = [node];
  runtime.activeNode = node;
  emitSelectionChanges(runtime, true, previousActiveNode);
}

export function toggleNodeSelection<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
  node: NodeType,
): void {
  if (isNodeSelected(state, node)) {
    removeNodeFromSelection(state, node);
  } else {
    addNodeToSelection(state, node);
  }
}

function emitSelectionChanges<NodeType extends HierarchyNodeAny>(
  runtime: SelectionStateRuntime<NodeType>,
  selectionChanged: boolean,
  previousActiveNode: NodeType | null,
): void {
  if (selectionChanged && runtime.signals.onChange.data !== null) {
    emitSignal(runtime.signals.onChange, runtime.selectedNodes.slice());
  }
  if (previousActiveNode !== runtime.activeNode) {
    emitSignal(runtime.signals.onActiveChange, runtime.activeNode);
  }
}

function getSelectionStateRuntime<NodeType extends HierarchyNodeAny>(
  state: SelectionState<NodeType>,
): SelectionStateRuntime<NodeType> {
  return state[EntityRuntimeKey] as SelectionStateRuntime<NodeType>;
}
