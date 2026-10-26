import type { HasAppearance, HasAppearanceRuntime } from './HasAppearance.ts';
import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D.ts';
import type { Node, NodeRuntime } from './Node.ts';
export const Node3DKind = 'Node3D';
export interface Node3DFields extends HasAppearance, HasTransform3D {}
export type Node3D = Node<Node3DFields> & Node3DFields;
export type Node3DRuntime = NodeRuntime<Node3DFields> & HasAppearanceRuntime & HasTransform3DRuntime;
export const Node3DFieldsKey = Symbol('Node3DFields');
