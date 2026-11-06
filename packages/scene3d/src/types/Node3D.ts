import type { HasAppearance, HasAppearanceRuntime } from '@flighthq/node/contract';
import type { HasTransform3D, HasTransform3DRuntime } from '@flighthq/node/contract';
import type { Node, NodeRuntime } from '@flighthq/node/contract';
export const Node3DKind = 'Node3D';
export interface Node3DFields extends HasAppearance, HasTransform3D {}
export type Node3D = Node<Node3DFields> & Node3DFields;
export type Node3DRuntime = NodeRuntime<Node3DFields> & HasAppearanceRuntime & HasTransform3DRuntime;
// Registered (Symbol.for) so @flighthq/types' deprecated compatibility copy is the same symbol.
export const Node3DFieldsKey: unique symbol = Symbol.for('@flighthq/scene3d/Node3DFields');
