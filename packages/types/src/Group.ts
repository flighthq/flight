import type { SceneNode, SceneNodeRuntime } from './SceneNode';
export interface Group extends SceneNode {}
export type GroupRuntime = SceneNodeRuntime;
export const GroupKind = 'Group';
