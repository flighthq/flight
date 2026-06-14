import {
  createSceneNode,
  createSceneNodeRuntime,
  getSceneNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initTransformRuntimeTrait,
  initTransformTrait,
} from '@flighthq/node';
import type { SceneNodeRuntimeFactory } from '@flighthq/types';
import type {
  MethodsOf,
  PartialNode,
  SceneNode,
  SpriteNode,
  SpriteNodeDataFactory,
  SpriteNodeRuntime,
  SpriteNodeRuntimeFactory,
} from '@flighthq/types';
import { SpriteGraph } from '@flighthq/types';

export function createSpriteNode<Runtime extends SpriteNodeRuntime>(
  kind: symbol,
  obj?: Readonly<PartialNode<SpriteNode>>,
  createData?: SpriteNodeDataFactory,
  createSpriteNodeRuntimeFactory?: SpriteNodeRuntimeFactory<Runtime>,
): SpriteNode {
  const out = createSceneNode(
    SpriteGraph,
    kind,
    obj,
    createData,
    createSpriteNodeRuntimeFactory ?? (createSpriteNodeRuntime as unknown as SceneNodeRuntimeFactory<Runtime>),
  ) as SpriteNode;
  initTransformTrait(out, obj);
  initBoundsRectangleTrait(out, obj);
  initAppearanceTrait(out, obj);
  out.alphaEnabled = obj?.alphaEnabled ?? true;
  out.blendModeEnabled = obj?.blendModeEnabled ?? true;
  out.colorTransformEnabled = obj?.colorTransformEnabled ?? true;
  out.originX = obj?.originX ?? 1;
  out.originY = obj?.originY ?? 1;
  return out;
}

export function createSpriteNodeRuntime(methods?: Readonly<Partial<MethodsOf<SpriteNodeRuntime>>>): SpriteNodeRuntime {
  const out = createSceneNodeRuntime(methods) as SpriteNodeRuntime;
  initTransformRuntimeTrait(out, methods);
  initBoundsRectangleRuntimeTrait(out, methods);
  return out;
}

export function getSpriteNodeRuntime(source: Readonly<SpriteNode>): Readonly<SpriteNodeRuntime> {
  return getSceneNodeRuntime(source) as SpriteNodeRuntime;
}

// eslint-disable-next-line
export function isSpriteNode(source: Readonly<SceneNode<any, any>>): boolean {
  return getSceneNodeRuntime(source).graph === SpriteGraph;
}
