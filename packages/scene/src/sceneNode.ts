import { createMatrix4 } from '@flighthq/geometry';
import { createNode, createNodeRuntime, enableNodeSignals, getNodeRuntime, getNodeSignals } from '@flighthq/node';
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
  node.localMatrix = createMatrix4();
  return node as SceneNode;
}

export function createSceneNodeRuntime(): SceneNodeRuntime {
  const out = createNodeRuntime<SceneNodeTraits>() as SceneNodeRuntime;
  out.traits = SceneNodeTraitsKey;
  out.worldAlpha = null;
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

// The resolved parent×self opacity prepareSceneRender folded onto this node this frame, or 1 when
// the node has not been prepared yet (so an unprepared node reads as fully opaque). Render state,
// not authoring data — read the node's `alpha` field for its own authored opacity.
export function getSceneNodeWorldAlpha(source: Readonly<SceneNode>): number {
  return getSceneNodeRuntime(source).worldAlpha ?? 1;
}
