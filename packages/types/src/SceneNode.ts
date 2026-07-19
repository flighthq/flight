import type { HasAppearance, HasAppearanceRuntime } from './HasAppearance';
import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime } from './Node';
export const SceneNodeKind = 'SceneNode';
export interface SceneNodeTraits extends HasAppearance, HasTransform3D {}
export type SceneNode = Node<SceneNodeTraits> & SceneNodeTraits;
export type SceneNodeRuntime = NodeRuntime<SceneNodeTraits> & HasAppearanceRuntime & HasTransform3DRuntime;
export const SceneNodeTraitsKey = Symbol('SceneNodeTraits');
