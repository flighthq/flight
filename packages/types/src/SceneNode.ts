import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime } from './Node';
export const SceneNodeKind = 'SceneNode';
export interface SceneNodeTraits extends HasTransform3D {}
export type SceneNode = Node<SceneNodeTraits> & SceneNodeTraits;
export type SceneNodeRuntime = NodeRuntime<SceneNodeTraits> & HasTransform3DRuntime;
export const SceneNodeTraitsKey = Symbol('SceneNodeTraits');
