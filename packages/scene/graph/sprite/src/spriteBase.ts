import type { GraphNodeDataFactory, GraphNodeRuntimeFactory } from '@flighthq/scene-graph-core';
import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
} from '@flighthq/scene-graph-core';
import type {
  MethodsOf,
  PartialNode,
  SpriteBase,
  SpriteBaseData,
  SpriteBaseRuntime,
  SpriteBaseTraits,
} from '@flighthq/types';
import { SpriteGraph } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export type SpriteGraphNodeDataFactory = GraphNodeDataFactory<SpriteBaseData>;
export type SpriteGraphNodeRuntimeFactory<R extends SpriteBaseRuntime> = GraphNodeRuntimeFactory<
  typeof SpriteGraph,
  SpriteBaseTraits,
  R
>;

export function createSpriteBase<R extends SpriteBaseRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<SpriteBase>>,
  createData?: SpriteGraphNodeDataFactory,
  createRuntime?: SpriteGraphNodeRuntimeFactory<R>,
): SpriteBase {
  const out = createGraphNode(
    SpriteGraph,
    kind,
    obj,
    createData,
    createRuntime ?? (createSpriteBaseRuntime as GraphNodeRuntimeFactory<typeof SpriteGraph, SpriteBaseTraits, R>),
  ) as SpriteBase;
  initHasTransform2D(out, obj);
  initHasBoundsRect(out, obj);
  out.alpha = obj?.alpha ?? 1;
  out.alphaEnabled = obj?.alphaEnabled ?? true;
  out.blendMode = obj?.blendMode ?? BlendMode.Normal;
  out.blendModeEnabled = obj?.blendModeEnabled ?? true;
  out.colorTransform = obj?.colorTransform ?? null;
  out.colorTransformEnabled = obj?.colorTransformEnabled ?? true;
  out.originX = obj?.originX ?? 1;
  out.originY = obj?.originY ?? 1;
  out.shader = obj?.shader ?? null;
  return out;
}

export function createSpriteBaseRuntime(methods?: Readonly<Partial<MethodsOf<SpriteBaseRuntime>>>): SpriteBaseRuntime {
  const out = createGraphNodeRuntime(methods) as SpriteBaseRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  return out;
}

export function getSpriteBaseRuntime(source: Readonly<SpriteBase>): Readonly<SpriteBaseRuntime> {
  return getGraphNodeRuntime(source) as SpriteBaseRuntime;
}
