import type { Entity, EntityRuntime } from './Entity';
import type { NullScene, SceneNode, SceneNodeTraits } from './SceneNode';
import type { SceneSignals } from './SceneNodeSignals';

export interface HasSceneHierarchy extends Entity {}

export interface HasSceneHierarchyRuntime<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> extends EntityRuntime {
  canAddChild: (target: SceneNode<SceneKind, Traits>, child: SceneNode<SceneKind, Traits>) => boolean;
  children: SceneNode<SceneKind, Traits>[] | null;
  sceneSignals: SceneSignals;
  parent: SceneNode<SceneKind, Traits> | null;
}

export type SceneHierarchyNode<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneNode<SceneKind, Traits> & HasSceneHierarchy;

export type SceneHierarchyNodeOf<
  SceneKind extends symbol = typeof NullScene,
  Traits extends object = SceneNodeTraits,
> = SceneHierarchyNode<SceneKind, Traits> & Traits;
