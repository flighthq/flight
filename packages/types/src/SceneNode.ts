import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime, NodeTraitsKey } from './Node';

export const SceneNodeKind: unique symbol = Symbol('SceneNode');

export interface SceneNodeTraits extends HasTransform3D {}

export type SceneNode = Node<SceneNodeTraits> & SceneNodeTraits;

export type SceneNodeRuntime = NodeRuntime<SceneNodeTraits> & HasTransform3DRuntime;

export const SceneNodeTraitsKey: NodeTraitsKey<SceneNodeTraits> = Symbol(
  'SceneNodeTraits',
) as NodeTraitsKey<SceneNodeTraits>;
