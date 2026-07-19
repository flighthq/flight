import {
  createNode,
  createNodeRuntime,
  enableNodeSignals,
  getNodeRuntime,
  getNodeSignals,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
} from '@flighthq/node';
import type { Kind, NodeSignals, SceneNode, SceneNodeRuntime, SceneNodeTraits } from '@flighthq/types';
import { SceneNodeKind, SceneNodeTraitsKey } from '@flighthq/types';

export type { SceneNode, SceneNodeRuntime, SceneNodeTraits } from '@flighthq/types';
export { SceneNodeKind } from '@flighthq/types';

export function createSceneNode(
  kind: Kind = SceneNodeKind,
  obj?: Readonly<Partial<Pick<SceneNode, 'alpha' | 'enabled' | 'name'>>>,
): SceneNode {
  const node = createNode<SceneNodeTraits>(kind, obj, undefined, createSceneNodeRuntime);
  node.alpha = obj?.alpha ?? 1;
  initTransform3DTrait(node);
  return node as SceneNode;
}

export function createSceneNodeRuntime(): SceneNodeRuntime {
  const out = createNodeRuntime<SceneNodeTraits>() as SceneNodeRuntime;
  out.traits = SceneNodeTraitsKey;
  out.worldAlpha = null;
  out.worldAlphaUsingAppearanceId = -1;
  out.worldAlphaUsingParentAppearanceId = -1;
  out.worldAppearanceId = 0;
  initTransform3DRuntimeTrait(out);
  return out;
}

export function enableSceneNodeSignals(source: SceneNode): NodeSignals {
  return enableNodeSignals(source);
}

export function getSceneNodeRuntime(source: Readonly<SceneNode>): SceneNodeRuntime {
  return getNodeRuntime(source) as SceneNodeRuntime;
}

export function getSceneNodeSignals(source: SceneNode): NodeSignals | null {
  return getNodeSignals(source);
}
