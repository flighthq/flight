import type { ColorAdjustmentRuntime } from './ColorAdjustmentRuntime';
import type { HasAppearance, HasAppearanceRuntime } from './HasAppearance';
import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime } from './Node';
export const Node3DKind = 'Node3D';
export interface Node3DTraits extends HasAppearance, HasTransform3D {}
export type Node3D = Node<Node3DTraits> & Node3DTraits;
export type Node3DRuntime = NodeRuntime<Node3DTraits> &
  ColorAdjustmentRuntime &
  HasAppearanceRuntime &
  HasTransform3DRuntime;
export const Node3DTraitsKey = Symbol('Node3DTraits');
