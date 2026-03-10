import type { GraphNodeRuntimeFactory, NodeDataFactory } from '@flighthq/scene-graph-core';
import {
  createGraphNode,
  createGraphNodeRuntime,
  getRuntime,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
} from '@flighthq/scene-graph-core';
import type { PartialWithData, SpriteBase, SpriteBaseData, SpriteBaseRuntime } from '@flighthq/types';
import { BlendMode, SpriteGraph } from '@flighthq/types';

export type SpriteGraphNodeDataFactory = NodeDataFactory<SpriteBaseData>;
export type SpriteGraphNodeRuntimeFactory<R extends SpriteBaseRuntime> = GraphNodeRuntimeFactory<typeof SpriteGraph, R>;

export function createSpriteBase<R extends SpriteBaseRuntime>(
  kind: symbol,
  obj?: Readonly<PartialWithData<SpriteBase>>,
  createData?: SpriteGraphNodeDataFactory,
  createRuntime?: SpriteGraphNodeRuntimeFactory<R>,
): SpriteBase {
  const out = createGraphNode(
    SpriteGraph,
    kind,
    obj,
    createData,
    createRuntime ?? (createSpriteBaseRuntime as GraphNodeRuntimeFactory<typeof SpriteGraph, R>),
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

export function createSpriteBaseRuntime(methods?: Readonly<Partial<SpriteBaseRuntime>>): SpriteBaseRuntime {
  const out = createGraphNodeRuntime(methods) as SpriteBaseRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  return out;
}

export function getSpriteBaseRuntime(source: Readonly<SpriteBase>): SpriteBaseRuntime {
  return getRuntime(source) as SpriteBaseRuntime;
}
