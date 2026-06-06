import type { EntityRuntime, EntityRuntimeKey } from './Entity';
import type { HasSceneHierarchy, HasSceneHierarchyRuntime } from './HasSceneHierarchy';
import type { InteractionSignals } from './InteractionSignals';
import type { SceneNodeData, SceneNodeDataFactory, SceneNodeRuntimeFactory } from './Node';
import type { SceneSignals } from './SceneNodeSignals';

export interface SceneNodeTraits {
  data: SceneNodeData | null;
  enabled: boolean;
  kind: symbol;
  name: string | null;
}

export interface SceneNode<SceneKind extends symbol = typeof NullScene, Traits extends object = SceneNodeTraits>
  extends SceneNodeTraits, HasSceneHierarchy {
  [EntityRuntimeKey]: SceneNodeRuntime<SceneKind, Traits> | undefined;
}

export interface SceneNodeRuntime<SceneKind extends symbol = typeof NullScene, Traits extends object = SceneNodeTraits>
  extends EntityRuntime, HasSceneHierarchyRuntime<SceneKind, Traits> {
  appearanceID: number;
  boundsUsingLocalBoundsID: number;
  boundsUsingLocalTransformID: number;
  graph: SceneKind;
  interactionSignals: InteractionSignals | null;
  localBoundsID: number;
  localBoundsUsingLocalBoundsID: number;
  localTransformID: number;
  localTransformUsingLocalTransformID: number;
  worldBoundsUsingLocalBoundsID: number;
  worldBoundsUsingWorldTransformID: number;
  worldTransformID: number;
  worldTransformUsingLocalTransformID: number;
  worldTransformUsingParentTransformID: number;
}

export const SceneNodeKind: unique symbol = Symbol('SceneNode');
export type SceneNodeOf<SceneKind extends symbol, Traits extends object> = SceneNode<SceneKind, Traits> & Traits;
export const NullScene: unique symbol = Symbol('NullScene');

export type { SceneNodeData, SceneNodeDataFactory, SceneNodeRuntimeFactory, SceneSignals };
