import type { HasAppearance3D, HasAppearance3DRuntime } from './HasAppearance3D';
import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime } from './Node';
export const SceneNodeKind = 'SceneNode';
export interface SceneNodeTraits extends HasAppearance3D, HasTransform3D {}
export type SceneNode = Node<SceneNodeTraits> & SceneNodeTraits;
export type SceneNodeRuntime = NodeRuntime<SceneNodeTraits> & HasAppearance3DRuntime & HasTransform3DRuntime;
export const SceneNodeTraitsKey = Symbol('SceneNodeTraits');
