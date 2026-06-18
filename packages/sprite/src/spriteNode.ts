import {
  createNode,
  createNodeRuntime,
  getNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initClipRectangleTrait,
  initMaterialTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
} from '@flighthq/node';
import type { NodeRuntimeFactory } from '@flighthq/types';
import type {
  MethodsOf,
  NodeAny,
  PartialNode,
  SpriteNode,
  SpriteNodeDataFactory,
  SpriteNodeRuntime,
  SpriteNodeRuntimeFactory,
} from '@flighthq/types';
import { SpriteNodeTraitsKey } from '@flighthq/types';

export function createSpriteNode<Runtime extends SpriteNodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<SpriteNode>>,
  createData?: SpriteNodeDataFactory,
  createSpriteNodeRuntimeFactory?: SpriteNodeRuntimeFactory<Runtime>,
): SpriteNode {
  const out = createNode(
    kind,
    obj,
    createData,
    createSpriteNodeRuntimeFactory ?? (createSpriteNodeRuntime as unknown as NodeRuntimeFactory<Runtime>),
  ) as SpriteNode;
  initTransform2DTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  initMaterialTrait(out, obj);
  initClipRectangleTrait(out, obj);
  return out;
}

export function createSpriteNodeRuntime(methods?: Readonly<Partial<MethodsOf<SpriteNodeRuntime>>>): SpriteNodeRuntime {
  const out = createNodeRuntime(methods) as SpriteNodeRuntime;
  out.traits = SpriteNodeTraitsKey;
  initTransform2DRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getSpriteNodeRuntime(source: Readonly<SpriteNode>): Readonly<SpriteNodeRuntime> {
  return getNodeRuntime(source) as SpriteNodeRuntime;
}

export function isSpriteNode(node: NodeAny): node is SpriteNode {
  return getNodeRuntime(node).traits === SpriteNodeTraitsKey;
}
