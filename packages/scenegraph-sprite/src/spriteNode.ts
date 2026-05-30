import {
  createGraphNode,
  createGraphNodeRuntime,
  getGraphNodeRuntime,
  initHasAppearance,
  initHasBoundsRectangle,
  initHasBoundsRectangleRuntime,
  initHasTransform,
  initHasTransformRuntime,
} from '@flighthq/scenegraph-core';
import type { GraphNodeRuntimeFactory } from '@flighthq/types';
import type {
  GraphNode,
  MethodsOf,
  PartialNode,
  SpriteGraphNodeDataFactory,
  SpriteGraphNodeRuntimeFactory,
  SpriteNode,
  SpriteNodeRuntime,
  SpriteNodeTraits,
} from '@flighthq/types';
import { SpriteGraph } from '@flighthq/types';

export function createSpriteNode<Runtime extends SpriteNodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<SpriteNode>>,
  createData?: SpriteGraphNodeDataFactory,
  createSpriteNodeRuntimeFactory?: SpriteGraphNodeRuntimeFactory<Runtime>,
): SpriteNode {
  const out = createGraphNode(
    SpriteGraph,
    kind,
    obj,
    createData,
    createSpriteNodeRuntimeFactory ??
      (createSpriteNodeRuntime as GraphNodeRuntimeFactory<typeof SpriteGraph, SpriteNodeTraits, Runtime>),
  ) as SpriteNode;
  initHasTransform(out, obj);
  initHasBoundsRectangle(out, obj);
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
  initHasTransformRuntime(out, methods);
  initHasBoundsRectangleRuntime(out, methods);
  return out;
}

export function getSpriteNodeRuntime(source: Readonly<SpriteNode>): Readonly<SpriteNodeRuntime> {
  return getGraphNodeRuntime(source) as SpriteNodeRuntime;
}

// eslint-disable-next-line
export function isSpriteNode(source: Readonly<GraphNode<any, any>>): boolean {
  return getGraphNodeRuntime(source).graph === SpriteGraph;
}
