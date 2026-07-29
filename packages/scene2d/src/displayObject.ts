import {
  createNode,
  createNodeRuntime,
  addNodeChild,
  getNodeRuntime,
  getNodeParent,
  initAppearanceTrait,
  initBlendModeTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initClipTrait,
  initMaterialTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
  invalidateNodeAppearance,
  removeNodeChild,
} from '@flighthq/node/contract';
import type {
  ClipRegion,
  Node2D,
  Node2DDataFactory,
  Node2DRuntime,
  Node2DRuntimeFactory,
  Kind,
  MethodsOf,
  NodeAny,
  NodeRuntimeFactory,
  PartialNode,
} from '@flighthq/types/contract';
import { Node2DTraitsKey } from '@flighthq/types/contract';

export function clearNode2DSlotContent(target: Node2D): Node2D | null {
  const runtime = getNodeRuntime(target) as Node2DRuntime;
  const previous = runtime.slotContent;
  if (previous !== null && getNodeParent(previous) === target) removeNodeChild(target, previous);
  runtime.slotContent = null;
  return previous;
}

export function createNode2D<R extends Node2DRuntime>(
  kind: Kind,
  obj?: Readonly<PartialNode<Node2D>>,
  createData?: Node2DDataFactory,
  createNode2DRuntimeFactory?: Node2DRuntimeFactory<R>,
): Node2D {
  const out = createNode(
    kind,
    obj,
    createData,
    createNode2DRuntimeFactory ?? (createNode2DRuntime as unknown as NodeRuntimeFactory<R>),
  ) as Node2D;
  out.linkage = obj?.linkage ?? null;
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initBlendModeTrait(out, obj);
  initMaterialTrait(out, obj);
  initClipTrait(out, obj);
  return out;
}

export function createNode2DRuntime(methods?: Readonly<Partial<MethodsOf<Node2DRuntime>>>): Node2DRuntime {
  const out = createNodeRuntime(methods) as Node2DRuntime;
  out.traits = Node2DTraitsKey;
  out.scene2d = null;
  out.slotContent = null;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getNode2DRuntime(source: Readonly<Node2D>): Readonly<Node2DRuntime> {
  return getNodeRuntime(source) as Node2DRuntime;
}

export function getNode2DSlotContent(target: Readonly<Node2D>): Node2D | null {
  return (getNodeRuntime(target) as Node2DRuntime).slotContent;
}

export function isNode2D(node: NodeAny): node is Node2D {
  return getNodeRuntime(node).traits === Node2DTraitsKey;
}

export function setNode2DClip(source: Node2D, value: ClipRegion | null): void {
  source.clip = value;
  invalidateNodeAppearance(source);
}

export function setNode2DLinkage(target: Node2D, linkage: string | null): void {
  target.linkage = linkage;
}

export function setNode2DSlotContent(target: Node2D, content: Node2D | null): Node2D | null {
  const previous = clearNode2DSlotContent(target);
  if (content !== null) {
    addNodeChild(target, content);
    (getNodeRuntime(target) as Node2DRuntime).slotContent = content;
  }
  return previous;
}

export { createDisplayObject } from './displayContainer';
