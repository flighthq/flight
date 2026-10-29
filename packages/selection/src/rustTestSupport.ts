import type { Rectangle } from '@flighthq/geometry/contract';
import { createNode, createNodeRuntime, initBoundsRectangleRuntimeTrait } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';
import type { Path } from '@flighthq/path/contract';

import {
  applyPointerSelectionPolicy,
  findNodesInLassoSelection,
  findNodesInMarqueeSelection,
  getSelectedNodes,
} from './selectionCompat.ts';
import type {
  LassoSelection,
  MarqueeSelection,
  MarqueeSelectionMode,
  SelectionModifierState,
  SelectionState,
} from './selectionCompat.ts';

type AppearanceNodeRef = NodeRef & { alpha: number; visible: boolean };

function createTestNode(name: string): NodeRef {
  const node = createNode('SelectionTestNode');
  node.name = name;
  return node;
}

function createBoundedNode(name: string, rectangle: Readonly<Rectangle>, enabled: boolean, visible: boolean): NodeRef {
  const node = createNode('SelectionBoundsTestNode', undefined, () => {
    const runtime = createNodeRuntime();
    initBoundsRectangleRuntimeTrait(runtime as unknown as Parameters<typeof initBoundsRectangleRuntimeTrait>[0], {
      computeLocalBoundsRectangle(out) {
        out.x = rectangle.x;
        out.y = rectangle.y;
        out.width = rectangle.width;
        out.height = rectangle.height;
      },
    });
    return runtime;
  }) as AppearanceNodeRef;
  node.enabled = enabled;
  node.name = name;
  node.alpha = 1;
  node.visible = visible;
  return node;
}

function nodeName(node: Readonly<NodeRef>): string {
  return node.name ?? '';
}

function joinedNodeNames(nodes: readonly Readonly<NodeRef>[]): string {
  return nodes.map(nodeName).join(',');
}

function optionalNodeName(node: Readonly<NodeRef> | null): string {
  return node === null ? '' : nodeName(node);
}

function sameNode(a: Readonly<NodeRef>, b: Readonly<NodeRef>): boolean {
  return a === b;
}

function sameNodes(a: readonly Readonly<NodeRef>[], b: readonly Readonly<NodeRef>[]): boolean {
  return a.length === b.length && a.every((node, index) => node === b[index]);
}

function lassoMatches(selection: Readonly<LassoSelection>, candidates: readonly NodeRef[]): NodeRef[] {
  return findNodesInLassoSelection(selection, candidates);
}

function marqueeMatches(
  selection: Readonly<MarqueeSelection>,
  candidates: readonly NodeRef[],
  mode?: MarqueeSelectionMode,
): NodeRef[] {
  return findNodesInMarqueeSelection(selection, candidates, mode);
}

function selectedNodesOf(state: SelectionState): readonly NodeRef[] {
  return getSelectedNodes(state);
}

function containMarqueeMode(): MarqueeSelectionMode {
  return 'contain';
}

function samePath(a: Readonly<Path>, b: Readonly<Path>): boolean {
  return a === b;
}

function sameRectangle(a: Readonly<Rectangle>, b: Readonly<Rectangle>): boolean {
  return a === b;
}

function hasEvenOddWinding(path: Readonly<Path>): boolean {
  return path.winding === 'evenOdd';
}

function hasOnlyMoveCommand(path: Readonly<Path>): boolean {
  return path.commands.length === 1 && path.commands[0] === 1;
}

function hasMoveLineCloseCommands(path: Readonly<Path>): boolean {
  return path.commands.length === 3 && path.commands[0] === 1 && path.commands[1] === 2 && path.commands[2] === 7;
}

function takeReentrantFlag(flag: { value: boolean }): boolean {
  if (flag.value) return false;
  flag.value = true;
  return true;
}

function applyPointerPolicy(
  state: SelectionState,
  hit: NodeRef | null | undefined,
  modifiers: Readonly<SelectionModifierState>,
): void {
  applyPointerSelectionPolicy(state, hit ?? null, modifiers);
}

export const rustTestSupport = {
  applyPointerPolicy,
  containMarqueeMode,
  createBoundedNode,
  createTestNode,
  hasEvenOddWinding,
  hasMoveLineCloseCommands,
  hasOnlyMoveCommand,
  joinedNodeNames,
  lassoMatches,
  marqueeMatches,
  nodeName,
  optionalNodeName,
  sameNode,
  sameNodes,
  samePath,
  sameRectangle,
  selectedNodesOf,
  takeReentrantFlag,
};
