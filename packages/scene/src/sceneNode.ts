import { createMatrix4 } from '@flighthq/geometry';
import { createNode, createNodeRuntime, enableNodeSignals, getNodeRuntime, getNodeSignals } from '@flighthq/node';
import type { NodeSignals, SceneNode, SceneNodeRuntime, SceneNodeTraits } from '@flighthq/types';
import { SceneNodeKind, SceneNodeTraitsKey } from '@flighthq/types';

export type { SceneNode, SceneNodeRuntime, SceneNodeTraits } from '@flighthq/types';
export { SceneNodeKind } from '@flighthq/types';

export function createSceneNode(
  kind: symbol = SceneNodeKind,
  obj?: Readonly<Partial<Pick<SceneNode, 'enabled' | 'name'>>>,
): SceneNode {
  const node = createNode<SceneNodeTraits>(kind, obj, undefined, createSceneNodeRuntime);
  node.localMatrix = createMatrix4();
  return node as SceneNode;
}

export function createSceneNodeRuntime(): SceneNodeRuntime {
  const out = createNodeRuntime<SceneNodeTraits>() as SceneNodeRuntime;
  out.traits = SceneNodeTraitsKey;
  out.worldMatrix = null;
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
