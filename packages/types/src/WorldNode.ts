import type { HasTransform3D, HasTransform3DRuntime } from './HasTransform3D';
import type { Node, NodeRuntime, NodeTraitsKey } from './Node';

export const WorldNodeKind: unique symbol = Symbol('WorldNode');

export interface WorldNodeTraits extends HasTransform3D {}

export type WorldNode = Node<WorldNodeTraits> & WorldNodeTraits;

export type WorldNodeRuntime = NodeRuntime<WorldNodeTraits> & HasTransform3DRuntime;

export const WorldNodeTraitsKey: NodeTraitsKey<WorldNodeTraits> = Symbol(
  'WorldNodeTraits',
) as NodeTraitsKey<WorldNodeTraits>;
