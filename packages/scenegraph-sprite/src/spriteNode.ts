import type { GraphNodeDataFactory, GraphNodeRuntimeFactory } from '@flighthq/scenegraph-core';
import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initHasAppearance,
  initHasBoundsRect,
  initHasBoundsRectRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
} from '@flighthq/scenegraph-core';
import type {
  GraphNode,
  MethodsOf,
  PartialNode,
  SpriteNode,
  SpriteNodeData,
  SpriteNodeRuntime,
  SpriteNodeTraits,
} from '@flighthq/types';
import { SpriteGraph } from '@flighthq/types';

export type SpriteGraphNodeDataFactory = GraphNodeDataFactory<SpriteNodeData>;
export type SpriteGraphNodeRuntimeFactory<Runtime extends SpriteNodeRuntime> = GraphNodeRuntimeFactory<
  typeof SpriteGraph,
  SpriteNodeTraits,
  Runtime
>;

export function createSpriteNode<Runtime extends SpriteNodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<SpriteNode>>,
  createData?: SpriteGraphNodeDataFactory,
  createRuntime?: SpriteGraphNodeRuntimeFactory<Runtime>,
): SpriteNode {
  const out = createGraphNode(
    SpriteGraph,
    kind,
    obj,
    createData,
    createRuntime ??
      (createSpriteNodeRuntime as GraphNodeRuntimeFactory<typeof SpriteGraph, SpriteNodeTraits, Runtime>),
  ) as SpriteNode;
  initHasTransform2D(out, obj);
  initHasBoundsRect(out, obj);
  initHasAppearance(out, obj);
  out.alphaEnabled = obj?.alphaEnabled ?? true;
  out.blendModeEnabled = obj?.blendModeEnabled ?? true;
  out.colorTransformEnabled = obj?.colorTransformEnabled ?? true;
  out.originX = obj?.originX ?? 1;
  out.originY = obj?.originY ?? 1;
  return out;
}

export function createSpriteNodeRuntime(methods?: Readonly<Partial<MethodsOf<SpriteNodeRuntime>>>): SpriteNodeRuntime {
  const out = createGraphNodeRuntime(methods) as SpriteNodeRuntime;
  initHasTransform2DRuntime(out, methods);
  initHasBoundsRectRuntime(out, methods);
  return out;
}

export function getSpriteNodeRuntime(source: Readonly<SpriteNode>): Readonly<SpriteNodeRuntime> {
  return getGraphNodeRuntime(source) as SpriteNodeRuntime;
}

// eslint-disable-next-line
export function isSpriteNode(source: Readonly<GraphNode<any, any>>): boolean {
  return getGraphNodeRuntime(source).graph === SpriteGraph;
}
