// Generated from crates/flight-selection/src/selection_state.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';

import { isSameSelectionNode } from './nodeCompat.ts';
import type { SelectionSignals } from './selectionCompat.ts';
import type { SelectionStateRaw, SelectionStateRuntime } from './types.ts';
import { selectionStateStateStore } from './types.ts';

interface SelectionMutation {
  previousActiveNode: NodeRef | null;
}

interface SelectionChangeEvent {
  selectedNodes: NodeRef[];
}

interface ActiveChangeEvent {
  activeNode: NodeRef | null;
}

export function addNodeToSelectionCore(state: SelectionStateRaw, node: Readonly<NodeRef>): void {
  const mutation = addNodeMutation(selectionStateStateStore.get(state)!, node);
  if (mutation === null) {
    return;
  }
  emitSelectionChanges(state, mutation!.previousActiveNode);
}

export function clearSelectionCore(state: SelectionStateRaw): void {
  const mutation = clearSelectionMutation(selectionStateStateStore.get(state)!);
  if (mutation === null) {
    return;
  }
  emitSelectionChanges(state, mutation!.previousActiveNode);
}

function addNodeMutation(runtime: SelectionStateRuntime, node: Readonly<NodeRef>): SelectionMutation | null {
  if (containsNode(runtime.selectedNodeSet, node)) {
    return null;
  }
  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodes.push(node);
  runtime.selectedNodeSet.push(node);
  runtime.activeNode = node;
  return { previousActiveNode: previousActiveNode };
}

function clearSelectionMutation(runtime: SelectionStateRuntime): SelectionMutation | null {
  if (runtime.selectedNodes.length === 0) {
    return null;
  }
  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodes.length = 0;
  runtime.selectedNodeSet.length = 0;
  runtime.activeNode = null;
  return { previousActiveNode: previousActiveNode };
}

export function createSelectionStateCore(): SelectionStateRaw {
  let out: SelectionStateRaw = allocateEntity<SelectionStateRaw>();
  initializeSelectionStateCore(out);
  return out;
}

export function getActiveNodeCore(state: SelectionStateRaw): NodeRef | null {
  return selectionStateStateStore.get(state)!.activeNode;
}

function containsNode(nodes: Readonly<NodeRef[]>, node: Readonly<NodeRef>): boolean {
  return nodes.some((selected) => isSameSelectionNode(selected, node));
}

function lastNode(nodes: Readonly<NodeRef[]>): NodeRef | null {
  if (nodes.length === 0) {
    return null;
  }
  return nodes[nodes.length - 1];
}

function emitSelectionChanges(state: SelectionStateRaw, previousActiveNode: NodeRef | null): void {
  const changeEvent: SelectionChangeEvent | null = (() => {
    const runtime = selectionStateStateStore.get(state)!;
    const selectedNodes: Readonly<NodeRef[]> = runtime.selectedNodes;
    return runtime.signals.onChange.data! !== null ? { selectedNodes: selectedNodes.slice() } : null;
  })();
  if (changeEvent !== null) {
    const event = changeEvent;
    const signals = getSelectionSignalsCore(state);
    emitSignal(signals.onChange, event.selectedNodes);
  }
  const activeEvent: ActiveChangeEvent | null = (() => {
    const runtime = selectionStateStateStore.get(state)!;
    return sameOptionalNode(previousActiveNode, runtime.activeNode) ? null : { activeNode: runtime.activeNode };
  })();
  if (activeEvent !== null) {
    const event = activeEvent;
    const signals = getSelectionSignalsCore(state);
    emitSignal(signals.onActiveChange, event.activeNode);
  }
}

export function getSelectedNodesCore(out: NodeRef[], state: SelectionStateRaw): void {
  out.length = 0;
  const selectedNodes = selectionStateStateStore.get(state)!.selectedNodes;
  for (const node of selectedNodes) {
    out.push(node);
  }
}

export function getSelectionCountCore(state: SelectionStateRaw): number {
  return selectionStateStateStore.get(state)!.selectedNodes.length;
}

export function getSelectionSignalsCore(state: SelectionStateRaw): SelectionSignals {
  return selectionStateStateStore.get(state)!.signals;
}

export function hasSelectionCore(state: SelectionStateRaw): boolean {
  return selectionStateStateStore.get(state)!.selectedNodes.length !== 0;
}

export function initializeSelectionStateCore(out: SelectionStateRaw): void {
  selectionStateStateStore.set(out, {
    activeNode: null,
    selectedNodeSet: [],
    selectedNodes: [],
    signals: { onActiveChange: createSignal(), onChange: createSignal() },
  });
}

export function isNodeSelectedCore(state: SelectionStateRaw, node: Readonly<NodeRef>): boolean {
  return containsNode(selectionStateStateStore.get(state)!.selectedNodeSet, node);
}

function removeNodeMutation(runtime: SelectionStateRuntime, node: Readonly<NodeRef>): SelectionMutation | null {
  if (!containsNode(runtime.selectedNodeSet, node)) {
    return null;
  }
  const previousActiveNode = runtime.activeNode;
  const selectedNodeSet: NodeRef[] = runtime.selectedNodeSet;
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(selectedNodeSet, (selected) => !isSameSelectionNode(selected, node));
  const selectedNodes: NodeRef[] = runtime.selectedNodes;
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(selectedNodes, (selected) => !isSameSelectionNode(selected, node));
  if (sameOptionalNode(runtime.activeNode, node)) {
    runtime.activeNode = lastNode(runtime.selectedNodes);
  }
  return { previousActiveNode: previousActiveNode };
}

export function removeNodeFromSelectionCore(state: SelectionStateRaw, node: Readonly<NodeRef>): void {
  const mutation = removeNodeMutation(selectionStateStateStore.get(state)!, node);
  if (mutation === null) {
    return;
  }
  emitSelectionChanges(state, mutation!.previousActiveNode);
}

function sameNodeList(a: Readonly<NodeRef[]>, b: Readonly<NodeRef[]>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (!isSameSelectionNode(a[index], b[index])) {
      return false;
    }
  }
  return true;
}

function sameOptionalNode(a: Readonly<NodeRef | null>, b: Readonly<NodeRef | null>): boolean {
  if (a !== null) {
    const aNode = a;
    if (b !== null) {
      const bNode = b;
      return isSameSelectionNode(aNode, bNode);
    }
    return false;
  }
  return b === null;
}

function replaceSelectionMutation(runtime: SelectionStateRuntime, selectedNodes: NodeRef[]): SelectionMutation | null {
  if (sameNodeList(runtime.selectedNodes, selectedNodes)) {
    return null;
  }
  const previousActiveNode = runtime.activeNode;
  runtime.selectedNodeSet = selectedNodes.slice();
  runtime.selectedNodes = selectedNodes;
  runtime.activeNode = lastNode(runtime.selectedNodes);
  return { previousActiveNode: previousActiveNode };
}

export function selectAllNodesCore(state: SelectionStateRaw, candidates: Readonly<NodeRef[]>): void {
  let selectedNodes: NodeRef[] = [] as never[];
  for (const candidate of candidates) {
    if (!containsNode(selectedNodes, candidate)) {
      selectedNodes.push(candidate);
    }
  }
  const mutation = replaceSelectionMutation(selectionStateStateStore.get(state)!, selectedNodes);
  if (mutation === null) {
    return;
  }
  emitSelectionChanges(state, mutation!.previousActiveNode);
}

export function selectNodeCore(state: SelectionStateRaw, node: Readonly<NodeRef>): void {
  const mutation = replaceSelectionMutation(selectionStateStateStore.get(state)!, [node]);
  if (mutation === null) {
    return;
  }
  emitSelectionChanges(state, mutation!.previousActiveNode);
}

export function toggleNodeSelectionCore(state: SelectionStateRaw, node: Readonly<NodeRef>): void {
  if (isNodeSelectedCore(state, node)) {
    removeNodeFromSelectionCore(state, node);
  } else {
    addNodeToSelectionCore(state, node);
  }
}
